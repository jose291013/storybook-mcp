import crypto from "crypto";

export const DRAFT_COOKIE_NAME = "storybook_draft_session";
export const CUSTOMER_SESSION_COOKIE_NAME = "storybook_customer_session";

function signature(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function createSignedPayload(data, secret) {
  if (!secret) throw new Error("Missing WooCommerce bridge secret");
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

function verifySignedPayload(token, secret) {
  if (!token || !secret) return null;
  const parts = String(token).split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("Invalid signed payload");
  const [payload, suppliedSignature] = parts;
  const expected = signature(payload, secret);
  const left = Buffer.from(suppliedSignature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw new Error("Invalid signed payload signature");
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid signed payload data");
  }
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
    if (name) {
      try { cookies[name] = decodeURIComponent(value); }
      catch { cookies[name] = value; }
    }
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
  return createSignedPayload({
    sub: String(wooCustomerId),
    email: String(email || ""),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  }, secret);
}

export function verifyWooCustomerToken(token, secret = process.env.WOOCOMMERCE_BRIDGE_SECRET) {
  let data;
  try { data = verifySignedPayload(token, secret); }
  catch (error) { throw new Error(String(error?.message || error).replace("signed payload", "customer token")); }
  if (!data) return null;
  if (!data.sub || !Number.isFinite(Number(data.sub))) throw new Error("Invalid WooCommerce customer id");
  if (!data.exp || data.exp <= Math.floor(Date.now() / 1000)) throw new Error("Expired customer token");
  return { wooCustomerId: String(data.sub), email: String(data.email || "") };
}

const WOO_AUTH_DESTINATIONS = ["interactive_reader", "family_share", "narration", "new_adventure", "credit_return"];
const CREDIT_RETURN_CONTEXTS = ["preview", "action_center", "modification"];
const CREDIT_RETURN_STATUSES = ["paid", "syncing", "pending", "failed", "cancelled", "back"];

function safeCreditReturnContext(value) {
  return CREDIT_RETURN_CONTEXTS.includes(value) ? value : "preview";
}

function safeCreditReturnStatus(value) {
  return CREDIT_RETURN_STATUSES.includes(value) ? value : "back";
}

export function createWooAuthState({
  projectId,
  destination = "creator",
  creditContext = "preview",
  creditStatus = "back",
  expiresInSeconds = 600,
}, secret = process.env.WOOCOMMERCE_BRIDGE_SECRET) {
  if (!projectId) throw new Error("Missing project id");
  const safeDestination = WOO_AUTH_DESTINATIONS.includes(destination) ? destination : "creator";
  return createSignedPayload({
    type: "woocommerce_auth",
    projectId: String(projectId),
    destination: safeDestination,
    ...(safeDestination === "credit_return" ? {
      creditContext: safeCreditReturnContext(creditContext),
      creditStatus: safeCreditReturnStatus(creditStatus),
    } : {}),
    nonce: crypto.randomBytes(18).toString("base64url"),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  }, secret);
}

export function verifyWooAuthState(token, secret = process.env.WOOCOMMERCE_BRIDGE_SECRET) {
  const data = verifySignedPayload(token, secret);
  if (!data || data.type !== "woocommerce_auth" || !data.projectId || !data.nonce) throw new Error("Invalid authentication state");
  if (!data.exp || data.exp <= Math.floor(Date.now() / 1000)) throw new Error("Expired authentication state");
  return {
    projectId: String(data.projectId),
    nonce: String(data.nonce),
    destination: WOO_AUTH_DESTINATIONS.includes(data.destination) ? data.destination : "creator",
    creditContext: safeCreditReturnContext(data.creditContext),
    creditStatus: safeCreditReturnStatus(data.creditStatus),
  };
}

function cookieSecurity(req) {
  return process.env.NODE_ENV === "production" || req.secure ? "; Secure" : "";
}

export function setWooCustomerSession(req, res, identity) {
  const days = Math.max(1, Number.parseInt(process.env.CUSTOMER_SESSION_DAYS || "7", 10) || 7);
  const token = createWooCustomerToken({ ...identity, expiresInSeconds: days * 86400 }, process.env.WOOCOMMERCE_BRIDGE_SECRET);
  res.append("Set-Cookie", `${CUSTOMER_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${days * 86400}${cookieSecurity(req)}`);
  return token;
}

export function clearWooCustomerSession(req, res) {
  res.append("Set-Cookie", `${CUSTOMER_SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieSecurity(req)}`);
}

export function readWooCustomer(req) {
  const authorization = String(req.headers.authorization || "");
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : String(req.headers["x-storybook-customer-token"] || readCookies(req)[CUSTOMER_SESSION_COOKIE_NAME] || "").trim();
  return verifyWooCustomerToken(token);
}
