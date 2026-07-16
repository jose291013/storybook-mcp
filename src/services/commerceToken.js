import crypto from "crypto";

const encode = (value) => Buffer.from(value).toString("base64url");

export function signCommercePayload(payload, secret = process.env.WOOCOMMERCE_BRIDGE_SECRET || "") {
  if (String(secret).length < 32) throw new Error("WooCommerce bridge secret is not configured");
  const body = encode(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyCommerceWebhookSignature({ orderId, customerId, reservationId = "", status, signature }, secret = process.env.WOOCOMMERCE_BRIDGE_SECRET || "") {
  if (!signature || String(secret).length < 32) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${customerId}|${reservationId}|${status}`).digest("hex");
  const supplied = String(signature);
  return supplied.length === expected.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export function woocommerceCheckoutBridgeUrl(token) {
  const source = process.env.WOOCOMMERCE_CHECKOUT_URL || process.env.WOOCOMMERCE_BRIDGE_URL || "";
  if (!source) throw new Error("WooCommerce checkout bridge URL is not configured");
  const url = new URL(source);
  url.search = "";
  url.searchParams.set("calitiki_checkout", "1");
  url.searchParams.set("token", token);
  return url.toString();
}
