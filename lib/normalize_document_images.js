import sharp from "sharp";
import { definePDFJSModule, getDocumentProxy, renderPageAsImage } from "unpdf";

const OUTPUT_MIME_TYPE = "image/jpeg";
const JPEG_QUALITY = 88;
const PDF_SCALE = 2;

let pdfJsReady = null;

function ensurePdfJs() {
  if (!pdfJsReady) {
    pdfJsReady = definePDFJSModule(() => import("pdfjs-dist"));
  }
  return pdfJsReady;
}

async function imageToJpeg(buffer) {
  return sharp(buffer)
    .rotate()
    .flatten({ background: "white" })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

async function pdfToJpegs(buffer) {
  await ensurePdfJs();

  const data = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(data);
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const rendered = await renderPageAsImage(pdf, pageNumber, {
      canvasImport: () => import("@napi-rs/canvas"),
      scale: PDF_SCALE,
    });

    const jpeg = await sharp(Buffer.from(rendered))
      .flatten({ background: "white" })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();

    pages.push({ pageNumber, buffer: jpeg, mimeType: OUTPUT_MIME_TYPE });
  }

  return pages;
}

export async function normalizeDocumentToJpegs({ buffer, mimeType }) {
  if (!buffer?.length) throw new Error("buffer is required");

  if (mimeType === "application/pdf") return pdfToJpegs(buffer);

  if (["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    const jpeg = await imageToJpeg(buffer);
    return [{ pageNumber: 1, buffer: jpeg, mimeType: OUTPUT_MIME_TYPE }];
  }

  throw new Error(`Unsupported document format: ${mimeType || "unknown"}`);
}
