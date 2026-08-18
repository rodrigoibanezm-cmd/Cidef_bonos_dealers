import sharp from "sharp";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const OUTPUT_MIME_TYPE = "image/jpeg";
const JPEG_QUALITY = 88;
const PDF_SCALE = 2;

async function imageToJpeg(buffer) {
  return sharp(buffer)
    .rotate()
    .flatten({ background: "white" })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

async function pdfToJpegs(buffer) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), disableWorker: true }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: PDF_SCALE });

    const operatorList = await page.getOperatorList();
    const svgGfx = new pdfjsLib.SVGGraphics(page.commonObjs, page.objs);
    const svg = await svgGfx.getSVG(operatorList, viewport);
    const svgMarkup = svg.outerHTML;

    const jpeg = await sharp(Buffer.from(svgMarkup))
      .flatten({ background: "white" })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();

    pages.push({ pageNumber, buffer: jpeg, mimeType: OUTPUT_MIME_TYPE });
  }

  return pages;
}

export async function normalizeDocumentToJpegs({ buffer, mimeType }) {
  if (!buffer?.length) throw new Error("buffer is required");

  if (mimeType === "application/pdf") {
    return pdfToJpegs(buffer);
  }

  if (["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    const jpeg = await imageToJpeg(buffer);
    return [{ pageNumber: 1, buffer: jpeg, mimeType: OUTPUT_MIME_TYPE }];
  }

  throw new Error(`Unsupported document format: ${mimeType || "unknown"}`);
}
