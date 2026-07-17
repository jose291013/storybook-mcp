import fs from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

const PAGE_SIZE_PT = (210 / 25.4) * 72;
const TEXT_PAGE_TYPES = new Set(["text", "opening_text", "closing_text"]);

function numericPageNumber(page) {
  return Number(page?.page_number || 0);
}

export function orderEbookPages(pages = []) {
  const available = pages.filter((page) => page?.previewUrl);
  if (!available.every((page) => page.page_type)) {
    return [...available].sort((left, right) => numericPageNumber(left) - numericPageNumber(right));
  }

  const opening = available
    .filter((page) => page.page_type === "opening_text")
    .sort((left, right) => numericPageNumber(left) - numericPageNumber(right));
  const closing = available
    .filter((page) => page.page_type === "closing_text")
    .sort((left, right) => numericPageNumber(left) - numericPageNumber(right));
  const middle = available.filter((page) => !["opening_text", "closing_text"].includes(page.page_type));
  const spreads = new Map();

  for (const page of middle) {
    const derivedSpread = Math.floor((Math.max(2, numericPageNumber(page)) - 2) / 2) + 1;
    const spreadNumber = Number(page.spread_number || derivedSpread);
    if (!spreads.has(spreadNumber)) spreads.set(spreadNumber, []);
    spreads.get(spreadNumber).push(page);
  }

  const digitalSpreads = [...spreads.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([, spreadPages]) => spreadPages.sort((left, right) => {
      const leftPriority = TEXT_PAGE_TYPES.has(left.page_type) ? 0 : left.page_type === "image" ? 1 : 2;
      const rightPriority = TEXT_PAGE_TYPES.has(right.page_type) ? 0 : right.page_type === "image" ? 1 : 2;
      return leftPriority - rightPriority || numericPageNumber(left) - numericPageNumber(right);
    }));

  return [...opening, ...digitalSpreads, ...closing];
}

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
  coverStorageKey = "",
  pages = [],
  outputsDir = "data/outputs",
  onProgress,
  loadAsset,
}) {
  if (!coverPreviewUrl) throw new Error("createEbookPdf: missing cover");

  const orderedAssets = [
    { previewUrl: coverPreviewUrl, storageKey: coverStorageKey, pageType: "cover" },
    ...orderEbookPages(pages)
      .map((page) => ({ previewUrl: page.previewUrl, storageKey: page.storageKey || "", pageType: page.page_type || "image", pageNumber: page.page_number })),
  ];

  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setLanguage(language.toLowerCase());
  pdf.setCreator("Mon Histoire Magique");
  pdf.setProducer("Mon Histoire Magique");

  for (let index = 0; index < orderedAssets.length; index += 1) {
    const asset = orderedAssets[index];
    const quality = ["text", "opening_text", "closing_text"].includes(asset.pageType) ? 92 : 86;
    const loadedAsset = loadAsset ? await loadAsset(asset) : null;
    const imageSource = loadedAsset || localOutputPath(asset.previewUrl, outputsDir);
    const imageBytes = await sharp(imageSource, { sequentialRead: true })
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
