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

export function bookOrderSignatureValue({
  orderId, customerId, projectId, reservationId = "", productType, pageCount,
  orderTotalCents = 0, status, narrationVoiceId = "", narrationStyleId = "",
  bookFormatId = "", pricingVersion = "",
}) {
  return [
    orderId, customerId, projectId, reservationId, productType, pageCount,
    orderTotalCents, status, narrationVoiceId, narrationStyleId, bookFormatId, pricingVersion,
  ].map((value) => String(value ?? "")).join("|");
}

export function signBookOrderWebhook(payload, secret = process.env.WOOCOMMERCE_BRIDGE_SECRET || "") {
  if (String(secret).length < 32) throw new Error("WooCommerce bridge secret is not configured");
  return crypto.createHmac("sha256", secret).update(bookOrderSignatureValue(payload)).digest("hex");
}

export function verifyBookOrderWebhook({ signature, ...payload }, secret = process.env.WOOCOMMERCE_BRIDGE_SECRET || "") {
  if (!signature || String(secret).length < 32) return false;
  const expected = signBookOrderWebhook(payload, secret);
  const supplied = String(signature);
  if (supplied.length === expected.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return true;
  // Once either V1 commerce field is present it must be covered by the current
  // signature. Compatibility signatures are accepted only for genuinely old
  // Bridge payloads where both fields are absent.
  if (payload.bookFormatId || payload.pricingVersion) return false;
  const bridge078Value = [
    payload.orderId, payload.customerId, payload.projectId, payload.reservationId || "",
    payload.productType, payload.pageCount, payload.orderTotalCents || 0, payload.status,
    payload.narrationVoiceId || "", payload.narrationStyleId || "",
  ].map((value) => String(value ?? "")).join("|");
  const bridge078 = crypto.createHmac("sha256", secret).update(bridge078Value).digest("hex");
  if (supplied.length === bridge078.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(bridge078))) return true;
  // Rolling-deploy compatibility for Bridge <= 0.5.8. Narration itself always
  // requires the new signature that binds its paid voice and style choices.
  if (payload.productType === "narration" || payload.narrationVoiceId || payload.narrationStyleId) return false;
  const legacyValue = [
    payload.orderId, payload.customerId, payload.projectId, payload.reservationId || "",
    payload.productType, payload.pageCount, payload.orderTotalCents || 0, payload.status,
  ].map((value) => String(value ?? "")).join("|");
  const legacy = crypto.createHmac("sha256", secret).update(legacyValue).digest("hex");
  return supplied.length === legacy.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(legacy));
}

export function verifyDeliveryLinkRequest({ orderId, customerId, projectId, timestamp, signature }, secret = process.env.WOOCOMMERCE_BRIDGE_SECRET || "", now = Date.now()) {
  if (!signature || String(secret).length < 32 || Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`delivery-link|${orderId}|${customerId}|${projectId}|${timestamp}`).digest("hex");
  return String(signature).length === expected.length && crypto.timingSafeEqual(Buffer.from(String(signature)), Buffer.from(expected));
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
