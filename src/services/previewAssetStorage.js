import fs from "fs/promises";
import path from "path";
import crypto from "node:crypto";
import sharp from "sharp";
import { getDeliveryStorage } from "./deliveryStorage.js";

const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/;

function outputFilename(assetUrl) {
  const pathname = new URL(String(assetUrl || ""), "http://localhost").pathname;
  if (!pathname.startsWith("/outputs/")) throw new Error("Preview asset is not a generated output");
  const filename = decodeURIComponent(path.basename(pathname));
  if (!SAFE_FILENAME.test(filename)) throw new Error("Preview asset filename is invalid");
  return filename;
}

export function previewAssetKey(projectId, filename) {
  const safeProjectId = String(projectId || "").trim();
  const safeFilename = String(filename || "").trim();
  if (!safeProjectId || !/^[A-Za-z0-9-]+$/.test(safeProjectId) || !SAFE_FILENAME.test(safeFilename)) {
    throw new Error("Preview asset identity is invalid");
  }
  return `ebooks/previews/${safeProjectId}/${safeFilename}`;
}

export function privatePreviewAssetUrl(projectId, filename) {
  return `/api/projects/${encodeURIComponent(projectId)}/preview-assets/${encodeURIComponent(filename)}`;
}

export async function persistPreviewAsset({
  projectId,
  assetUrl,
  outputsDir = "data/outputs",
  storage = getDeliveryStorage(),
}) {
  const filename = outputFilename(assetUrl);
  const body = await fs.readFile(path.resolve(outputsDir, filename));
  const metadata = await sharp(body).metadata();
  const mimeType = metadata.format === "jpeg" ? "image/jpeg" : `image/${metadata.format || "png"}`;
  const storageKey = previewAssetKey(projectId, filename);
  await storage.put({ key: storageKey, body, contentType: mimeType });
  return {
    storageKey,
    previewUrl: privatePreviewAssetUrl(projectId, filename),
    sha256: crypto.createHash("sha256").update(body).digest("hex"),
    mimeType,
    width: Number(metadata.width || 0),
    height: Number(metadata.height || 0),
    byteLength: body.length,
  };
}

export async function storageBodyToBuffer(body) {
  if (Buffer.isBuffer(body)) return body;
  if (!body || typeof body[Symbol.asyncIterator] !== "function") throw new Error("Private storage returned an unsupported body");
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}
