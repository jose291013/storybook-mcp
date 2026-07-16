import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const DEFAULT_LOCAL_DIR = path.resolve("data/private/ebooks");

function safeLocalPath(root, key) {
  const normalized = String(key || "").replaceAll("\\", "/").replace(/^\/+/, "");
  const target = path.resolve(root, normalized);
  if (!normalized || (!target.startsWith(`${path.resolve(root)}${path.sep}`) && target !== path.resolve(root))) throw new Error("Invalid private storage key");
  return target;
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
    return { body: fs.createReadStream(target), contentType: "application/pdf", byteSize: stat.size };
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
