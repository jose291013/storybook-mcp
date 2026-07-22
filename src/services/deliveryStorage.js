import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const DEFAULT_LOCAL_DIR = path.resolve("data/private/ebooks");

function contentTypeForKey(key) {
  const extension = path.extname(String(key || "")).toLowerCase();
  if (extension === ".png") return "image/png";
  if ([".jpg", ".jpeg"].includes(extension)) return "image/jpeg";
  if (extension === ".mp3") return "audio/mpeg";
  return "application/pdf";
}

function safeLocalPath(root, key) {
  const normalized = String(key || "").replaceAll("\\", "/").replace(/^\/+/, "");
  const target = path.resolve(root, normalized);
  if (!normalized || (!target.startsWith(`${path.resolve(root)}${path.sep}`) && target !== path.resolve(root))) throw new Error("Invalid private storage key");
  return target;
}

function safeStoragePrefix(value) {
  const prefix = String(value || "").replaceAll("\\", "/").replace(/^\/+/, "");
  const segments = prefix.replace(/\/$/, "").split("/");
  if (!prefix || segments.some((segment) => !segment || segment === "." || segment === "..") || !/^[A-Za-z0-9._/-]+$/.test(prefix)) {
    throw new Error("Invalid private storage prefix");
  }
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

export class LocalDeliveryStorage {
  constructor(root = DEFAULT_LOCAL_DIR) { this.root = path.resolve(root); }
  async put({ key, body }) {
    const target = safeLocalPath(this.root, key);
    await fsPromises.mkdir(path.dirname(target), { recursive: true });
    await fsPromises.writeFile(target, body);
    return { key, byteSize: Buffer.byteLength(body) };
  }
  async get(key) {
    const target = safeLocalPath(this.root, key);
    const stat = await fsPromises.stat(target);
    return { body: fs.createReadStream(target), contentType: contentTypeForKey(key), byteSize: stat.size };
  }
  async delete(key) {
    const target = safeLocalPath(this.root, key);
    await fsPromises.rm(target, { force: true });
    return { key, deleted: true };
  }
  async deletePrefix(prefix) {
    const normalized = safeStoragePrefix(prefix);
    const target = safeLocalPath(this.root, normalized);
    await fsPromises.rm(target, { recursive: true, force: true });
    return { prefix: normalized, deleted: true };
  }
}

export class S3DeliveryStorage {
  constructor({ client, bucket }) { this.client = client; this.bucket = bucket; }
  async put({ key, body, contentType = "application/pdf" }) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
    return { key, byteSize: Buffer.byteLength(body) };
  }
  async get(key) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return { body: result.Body, contentType: result.ContentType || "application/pdf", byteSize: Number(result.ContentLength || 0) };
  }
  async delete(key) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    return { key, deleted: true };
  }
  async deletePrefix(prefix) {
    const normalized = safeStoragePrefix(prefix);
    let continuationToken;
    do {
      const listed = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket, Prefix: normalized, ContinuationToken: continuationToken,
      }));
      const objects = (listed.Contents || []).map((item) => ({ Key: item.Key })).filter((item) => item.Key);
      if (objects.length) await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: objects, Quiet: true } }));
      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);
    return { prefix: normalized, deleted: true };
  }
}

function s3Configuration() {
  const bucket = String(process.env.PRIVATE_STORAGE_BUCKET || "").trim();
  const accessKeyId = String(process.env.PRIVATE_STORAGE_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.PRIVATE_STORAGE_SECRET_ACCESS_KEY || "").trim();
  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    bucket,
    region: process.env.PRIVATE_STORAGE_REGION || "auto",
    endpoint: process.env.PRIVATE_STORAGE_ENDPOINT || undefined,
    forcePathStyle: process.env.PRIVATE_STORAGE_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId, secretAccessKey },
  };
}

export function createDeliveryStorage() {
  const backend = String(process.env.PRIVATE_STORAGE_BACKEND || "auto").toLowerCase();
  const s3 = s3Configuration();
  if (backend === "s3" || (backend === "auto" && s3)) {
    if (!s3) throw new Error("Private S3 storage is not fully configured");
    return new S3DeliveryStorage({ client: new S3Client(s3), bucket: s3.bucket });
  }
  const hostedProduction = process.env.NODE_ENV === "production" || process.env.RENDER === "true";
  if (backend !== "local" && hostedProduction) throw new Error("Private object storage is required for ebook delivery in production");
  return new LocalDeliveryStorage(process.env.PRIVATE_STORAGE_LOCAL_DIR || DEFAULT_LOCAL_DIR);
}

let singleton;
export function getDeliveryStorage() {
  if (!singleton) singleton = createDeliveryStorage();
  return singleton;
}
