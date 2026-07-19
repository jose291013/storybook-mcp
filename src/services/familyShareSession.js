import crypto from "crypto";
import { readCookies } from "./draftIdentity.js";

export const FAMILY_SHARE_COOKIE_NAME = "calitiki_family_share";

function secret() {
  const value = String(process.env.FAMILY_SHARE_SIGNING_SECRET || process.env.DELIVERY_SIGNING_SECRET || "");
  if (value.length < 32) throw new Error("Family share signing secret is not configured");
  return value;
}

function signature(payload) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createFamilyShareSession(share) {
  const payload = Buffer.from(JSON.stringify({
    shareId: String(share.id), projectId: String(share.projectId), exp: Math.floor(Date.parse(share.expiresAt) / 1000),
  })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyFamilyShareSession(token) {
  const [payload, supplied, ...rest] = String(token || "").split(".");
  if (!payload || !supplied || rest.length) return null;
  const expected = signature(payload);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.shareId || !data.projectId || Number(data.exp) <= Math.floor(Date.now() / 1000)) return null;
    return { shareId: String(data.shareId), projectId: String(data.projectId), exp: Number(data.exp) };
  } catch { return null; }
}

export function readFamilyShareSession(req) {
  return verifyFamilyShareSession(readCookies(req)[FAMILY_SHARE_COOKIE_NAME]);
}

export function setFamilyShareSession(req, res, share) {
  const maxAge = Math.max(1, Math.floor((Date.parse(share.expiresAt) - Date.now()) / 1000));
  const secure = process.env.NODE_ENV === "production" || req.secure ? "; Secure" : "";
  const token = createFamilyShareSession(share);
  res.append("Set-Cookie", `${FAMILY_SHARE_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}
