import io
import json
import os
from http.server import BaseHTTPRequestHandler
from pathlib import PurePosixPath

import boto3
import fitz
from botocore.config import Config
from PIL import Image, ImageOps

JPEG_QUALITY = 88
PDF_DPI = 200


def _r2_client():
    endpoint = os.environ.get("R2_ENDPOINT")
    access_key = os.environ.get("R2_ACCESS_KEY_ID")
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
    bucket = os.environ.get("R2_BUCKET_NAME")

    if not all([endpoint, access_key, secret_key, bucket]):
        raise RuntimeError("R2 configuration missing")

    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )
    return client, bucket


def _page_prefix(key: str) -> str:
    if "/original/" in key:
        return key.split("/original/", 1)[0] + "/pages"
    return str(PurePosixPath(key).parent / "pages")


def _base_name(key: str) -> str:
    return PurePosixPath(key).stem


def _is_canonical_page(key: str) -> bool:
    path = f"/{key.strip('/')}"
    return "/pages/" in path and key.lower().endswith((".jpg", ".jpeg"))


def _image_to_jpeg(data: bytes) -> bytes:
    with Image.open(io.BytesIO(data)) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=JPEG_QUALITY, optimize=True)
        return output.getvalue()


def _pdf_to_jpegs(data: bytes):
    doc = fitz.open(stream=data, filetype="pdf")
    try:
        pages = []
        for index, page in enumerate(doc, start=1):
            pix = page.get_pixmap(dpi=PDF_DPI, alpha=False)
            jpeg = pix.tobytes("jpeg", jpg_quality=JPEG_QUALITY)
            pages.append((index, jpeg))
        return pages
    finally:
        doc.close()


def _normalize(data: bytes, content_type: str):
    normalized_type = (content_type or "").split(";", 1)[0].strip().lower()

    if normalized_type == "application/pdf":
        return _pdf_to_jpegs(data)

    if normalized_type == "image/jpeg":
        return [(1, data)]

    if normalized_type in {"image/png", "image/webp"}:
        return [(1, _image_to_jpeg(data))]

    raise RuntimeError(f"Unsupported document format: {content_type or 'unknown'}")


class handler(BaseHTTPRequestHandler):
    def _json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            key = str(payload.get("key") or "").strip()
            content_type = str(payload.get("content_type") or "application/octet-stream")

            if not key:
                self._json(400, {"ok": False, "error": "key is required"})
                return

            s3, bucket = _r2_client()

            # A JPG under /pages/ is already the canonical review artifact.
            # Normalizing it again used to create /pages/pages/... and delete the
            # canonical object, leaving Neon file_id references broken.
            if _is_canonical_page(key):
                s3.head_object(Bucket=bucket, Key=key)
                self._json(200, {
                    "ok": True,
                    "source_deleted": False,
                    "already_normalized": True,
                    "pages_created": 1,
                    "pages": [{"page": 1, "key": key}],
                })
                return

            response = s3.get_object(Bucket=bucket, Key=key)
            data = response["Body"].read()
            actual_content_type = content_type or response.get("ContentType") or "application/octet-stream"

            pages = _normalize(data, actual_content_type)
            if not pages:
                raise RuntimeError("No se generaron páginas JPG")

            prefix = _page_prefix(key)
            base = _base_name(key)
            created = []

            for page_number, jpeg in pages:
                page_key = f"{prefix}/{base}_{page_number:03d}.jpg"
                if page_key == key:
                    raise RuntimeError("Normalization cannot overwrite its source object")
                s3.put_object(
                    Bucket=bucket,
                    Key=page_key,
                    Body=jpeg,
                    ContentType="image/jpeg",
                )
                s3.head_object(Bucket=bucket, Key=page_key)
                created.append({"page": page_number, "key": page_key})

            if len(created) != len(pages):
                raise RuntimeError("No se pudieron confirmar todas las páginas JPG")

            # Delete only the uploaded source after every canonical JPG has been
            # confirmed. Canonical /pages/ artifacts are never deleted here.
            s3.delete_object(Bucket=bucket, Key=key)

            self._json(
                200,
                {
                    "ok": True,
                    "source_deleted": True,
                    "already_normalized": False,
                    "pages_created": len(created),
                    "pages": created,
                },
            )
        except Exception as exc:
            print("R2 normalization failed", repr(exc))
            self._json(500, {"ok": False, "error": str(exc) or "R2 normalization failed"})
