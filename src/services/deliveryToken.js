import crypto from "crypto";

const encode = (value) => Buffer.from(value).toString("base64url");

function signingSecret(secret = process.env.DELIVERY_SIGNING_SECRET || process.env.WOOCOMMERCE_BRIDGE_SECRET || "") {
  if (String(secret).length < 32) throw new Error("Delivery signing secret is not configured");
  return String(secret);
}

export function signDeliveryToken(payload, { secret, expiresInSeconds } = {}) {
  const lifetime = Math.max(60, Number(expiresInSeconds || Number(process.env.EBOOK_LINK_DAYS || 7) * 86400));
  const body = encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + lifetime }));
  const signature = crypto.createHmac("sha256", signingSecret(secret)).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyDeliveryToken(token, { secret, now = Date.now() } = {}) {
  const [body, supplied] = String(token || "").split(".");
  if (!body || !supplied) throw new Error("Invalid delivery token");
  const expected = crypto.createHmac("sha256", signingSecret(secret)).update(body).digest("base64url");
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new Error("Invalid delivery token");
  let payload;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); }
  catch { throw new Error("Invalid delivery token"); }
  if (!payload.exp || payload.exp < Math.floor(now / 1000)) throw new Error("Delivery link expired");
  return payload;
}

export function createDeliveryUrl({ projectId, orderId, customerId, storageKey }, options = {}) {
  const baseUrl = String(options.baseUrl || process.env.BASE_URL || "").replace(/\/$/, "");
  if (!baseUrl) throw new Error("BASE_URL is required for ebook delivery");
  const token = signDeliveryToken({ projectId, orderId, customerId, storageKey }, options);
  return `${baseUrl}/api/deliveries/ebook/${encodeURIComponent(projectId)}?token=${encodeURIComponent(token)}`;
}
