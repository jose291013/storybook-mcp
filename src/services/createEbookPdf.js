import fs from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

const PAGE_SIZE_PT = (210 / 25.4) * 72;

function localOutputPath(assetUrl, outputsDir) {
  const pathname = new URL(assetUrl, "http://localhost").pathname;
  const filename = path.basename(decodeURIComponent(pathname));
  if (!filename || !filename.toLowerCase().endsWith(".png")) {
    throw new Error("createEbookPdf: unsupported page asset");
  }
  return path.join(outputsDir, filename);
}

export async function createEbookPdfBuffer({
  title = "Personalized story",
  language = "FR",
  coverPreviewUrl,
  pages = [],
  outputsDir = "data/outputs",
  onProgress,
}) {
  if (!coverPreviewUrl) throw new Error("createEbookPdf: missing cover");

  const orderedAssets = [
    { previewUrl: coverPreviewUrl, pageType: "cover" },
    ...pages
      .filter((page) => page?.previewUrl)
      .sort((a, b) => a.page_number - b.page_number)
      .map((page) => ({ previewUrl: page.previewUrl, pageType: page.page_type || "image", pageNumber: page.page_number })),
  ];

  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setLanguage(language.toLowerCase());
  pdf.setCreator("Mon Histoire Magique");
  pdf.setProducer("Mon Histoire Magique");

  for (let index = 0; index < orderedAssets.length; index += 1) {
    const asset = orderedAssets[index];
    const quality = ["text", "opening_text", "closing_text"].includes(asset.pageType) ? 92 : 86;
    const imageBytes = await sharp(localOutputPath(asset.previewUrl, outputsDir), { sequentialRead: true })
      .flatten({ background: "#fff8ed" })
      .resize(1240, 1240, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, chromaSubsampling: "4:4:4" })
      .toBuffer();
    const image = await pdf.embedJpg(imageBytes);
    const page = pdf.addPage([PAGE_SIZE_PT, PAGE_SIZE_PT]);
    page.drawImage(image, { x: 0, y: 0, width: PAGE_SIZE_PT, height: PAGE_SIZE_PT });
    await onProgress?.({ completed: index + 1, total: orderedAssets.length, pageNumber: asset.pageNumber || 0 });
  }

  const bytes = await pdf.save({ useObjectStreams: true, addDefaultPage: false });
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
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
  const bytes = await createEbookPdfBuffer({ title, language, coverPreviewUrl, pages, outputsDir });
  await fs.mkdir(outputsDir, { recursive: true });
  const filename = `ebook-${jobId}.pdf`;
  await fs.writeFile(path.join(outputsDir, filename), bytes);
  return `/outputs/${filename}`;
}

export const EBOOK_PAGE_SIZE_PT = PAGE_SIZE_PT;
