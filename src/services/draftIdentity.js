import crypto from "crypto";

export const DRAFT_COOKIE_NAME = "storybook_draft_session";

function signature(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

export function hashDraftOwner(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

export function readCookies(req) {
  return String(req.headers.cookie || "").split(";").reduce((cookies, pair) => {
    const index = pair.indexOf("=");
    if (index < 0) return cookies;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (name) cookies[name] = decodeURIComponent(value);
    return cookies;
  }, {});
}

export function ensureDraftOwner(req, res) {
  const existing = readCookies(req)[DRAFT_COOKIE_NAME];
  const token = /^[A-Za-z0-9_-]{32,128}$/.test(existing || "")
    ? existing
    : crypto.randomBytes(32).toString("base64url");
  if (token !== existing) {
    const days = Math.max(1, Number.parseInt(process.env.DRAFT_SESSION_DAYS || "7", 10) || 7);
    const secure = process.env.NODE_ENV === "production" || req.secure;
    res.append("Set-Cookie", `${DRAFT_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${days * 86400}${secure ? "; Secure" : ""}`);
  }
  return { token, ownerHash: hashDraftOwner(token) };
}

export function createWooCustomerToken({ wooCustomerId, email = "", expiresInSeconds = 300 }, secret) {
  if (!secret) throw new Error("Missing WooCommerce bridge secret");
  const payload = Buffer.from(JSON.stringify({
    sub: String(wooCustomerId),
    email: String(email || ""),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  })).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyWooCustomerToken(token, secret = process.env.WOOCOMMERCE_BRIDGE_SECRET) {
  if (!token || !secret) return null;
  const [payload, suppliedSignature] = String(token).split(".");
  if (!payload || !suppliedSignature) throw new Error("Invalid customer token");
  const expected = signature(payload, secret);
  const left = Buffer.from(suppliedSignature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw new Error("Invalid customer token signature");
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid customer token payload");
  }
  if (!data.sub || !Number.isFinite(Number(data.sub))) throw new Error("Invalid WooCommerce customer id");
  if (!data.exp || data.exp <= Math.floor(Date.now() / 1000)) throw new Error("Expired customer token");
  return { wooCustomerId: String(data.sub), email: String(data.email || "") };
}

export function readWooCustomer(req) {
  const authorization = String(req.headers.authorization || "");
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : String(req.headers["x-storybook-customer-token"] || "").trim();
  return verifyWooCustomerToken(token);
}
