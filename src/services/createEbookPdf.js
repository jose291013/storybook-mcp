import fs from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";

const PAGE_SIZE_PT = (210 / 25.4) * 72;

function localOutputPath(assetUrl, outputsDir) {
  const pathname = new URL(assetUrl, "http://localhost").pathname;
  const filename = path.basename(decodeURIComponent(pathname));
  if (!filename || !filename.toLowerCase().endsWith(".png")) {
    throw new Error("createEbookPdf: unsupported page asset");
  }
  return path.join(outputsDir, filename);
}

export async function createEbookPdf({
  jobId,
  title = "Personalized story",
  language = "FR",
  coverPreviewUrl,
  pages = [],
  outputsDir = "data/outputs",
}) {
  if (!jobId) throw new Error("createEbookPdf: missing jobId");
  if (!coverPreviewUrl) throw new Error("createEbookPdf: missing cover");

  const orderedUrls = [
    coverPreviewUrl,
    ...pages
      .filter((page) => page?.previewUrl)
      .sort((a, b) => a.page_number - b.page_number)
      .map((page) => page.previewUrl),
  ];

  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setLanguage(language.toLowerCase());
  pdf.setCreator("Mon Histoire Magique");
  pdf.setProducer("Mon Histoire Magique");

  for (const assetUrl of orderedUrls) {
    const imageBytes = await fs.readFile(localOutputPath(assetUrl, outputsDir));
    const image = await pdf.embedPng(imageBytes);
    const page = pdf.addPage([PAGE_SIZE_PT, PAGE_SIZE_PT]);
    page.drawImage(image, { x: 0, y: 0, width: PAGE_SIZE_PT, height: PAGE_SIZE_PT });
  }

  await fs.mkdir(outputsDir, { recursive: true });
  const filename = `ebook-${jobId}.pdf`;
  await fs.writeFile(path.join(outputsDir, filename), await pdf.save({ useObjectStreams: true }));
  return `/outputs/${filename}`;
}

export const EBOOK_PAGE_SIZE_PT = PAGE_SIZE_PT;
