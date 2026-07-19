import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { getDeliveryStorage } from "./deliveryStorage.js";
import { storageBodyToBuffer } from "./previewAssetStorage.js";

const LEGACY_UPLOAD_DIR = path.resolve("data/uploads");
const REFERENCE_PREFIX = "reference-photos/";

export class MissingReferencePhotoError extends Error {
  constructor(missingPhotoIds = []) {
    super("One or more reference photos are no longer available. Please upload them again before generating the preview.");
    this.name = "MissingReferencePhotoError";
    this.code = "reference_photos_missing";
    this.missingPhotoIds = missingPhotoIds;
  }
}

function safeReferenceKey(value) {
  const key = String(value || "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!key.startsWith(REFERENCE_PREFIX) || !/^reference-photos\/[A-Za-z0-9._-]+$/.test(key)) {
    throw new Error("Invalid private reference-photo key");
  }
  return key;
}

function legacyPhotoPath(photoId) {
  const filename = path.basename(String(photoId || ""));
  if (!filename || filename !== String(photoId || "")) throw new Error("Invalid legacy reference-photo id");
  return path.join(LEGACY_UPLOAD_DIR, filename);
}

export async function persistReferencePhoto({ body, storage = getDeliveryStorage() }) {
  if (!Buffer.isBuffer(body) || !body.length) throw new Error("Reference photo is empty");
  const id = crypto.randomUUID();
  const normalized = await sharp(body, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  const storageKey = `${REFERENCE_PREFIX}${id}.jpg`;
  await storage.put({ key: storageKey, body: normalized, contentType: "image/jpeg" });
  return { id, storageKey, mimeType: "image/jpeg", size: normalized.length };
}

export async function loadReferencePhoto(photo, { storage = getDeliveryStorage() } = {}) {
  if (photo?.storageKey) {
    const storageKey = safeReferenceKey(photo.storageKey);
    const asset = await storage.get(storageKey);
    return {
      id: String(photo.id || ""),
      storageKey,
      mimeType: asset.contentType || photo.mimeType || "image/jpeg",
      buffer: await storageBodyToBuffer(asset.body),
    };
  }

  const id = String(photo?.id || "");
  const buffer = await fs.readFile(legacyPhotoPath(id));
  return { id, storageKey: "", mimeType: photo?.mimeType || "image/jpeg", buffer };
}

export async function loadReferencePhotoAssets(photos = [], options = {}) {
  const assets = new Map();
  const missing = [];
  for (const photo of photos) {
    try {
      const asset = await loadReferencePhoto(photo, options);
      if (!asset.buffer.length) throw new Error("Reference photo is empty");
      assets.set(String(photo.id), asset);
    } catch (error) {
      const status = Number(error?.$metadata?.httpStatusCode || error?.statusCode || 0);
      const missingObject = error?.code === "ENOENT" || error?.name === "NoSuchKey" || status === 404;
      if (!missingObject) throw error;
      missing.push(String(photo?.id || "unknown"));
    }
  }
  if (missing.length) throw new MissingReferencePhotoError(missing);
  return assets;
}

export function referencePhotoDataUrl(asset) {
  if (!asset?.buffer?.length) throw new Error("Reference photo asset is empty");
  return `data:${asset.mimeType || "image/jpeg"};base64,${asset.buffer.toString("base64")}`;
}
