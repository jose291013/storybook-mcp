import { normalizePageCount } from "./bookOptions.js";

export const LEGACY_DIGITAL_PRICING_VERSION = "digital_legacy_v1";
export const DIGITAL_PRICING_VERSION_V1 = "digital_ttc_037_v1";
export const LEGACY_EBOOK_PAGE_PRICE_EUR = 0.27875;
export const DIGITAL_PAGE_PRICE_EUR_V1 = 0.37;

export function pricingVersionForNewBook(env = process.env) {
  return String(env.BOOK_FORMAT_V1_ENABLED || "").trim().toLowerCase() === "true"
    ? DIGITAL_PRICING_VERSION_V1
    : LEGACY_DIGITAL_PRICING_VERSION;
}
export function normalizePricingVersion(value) {
  return value === DIGITAL_PRICING_VERSION_V1 ? DIGITAL_PRICING_VERSION_V1 : LEGACY_DIGITAL_PRICING_VERSION;
}

export function ebookUnitPriceForVersion(version) {
  return normalizePricingVersion(version) === DIGITAL_PRICING_VERSION_V1
    ? DIGITAL_PAGE_PRICE_EUR_V1
    : LEGACY_EBOOK_PAGE_PRICE_EUR;
}

export function calculateVersionedEbookPrice(pageCount, version) {
  return Math.round(normalizePageCount(pageCount) * ebookUnitPriceForVersion(version) * 100) / 100;
}

export function pricingWooSlug(version) {
  return normalizePricingVersion(version) === DIGITAL_PRICING_VERSION_V1 ? "ttc-037-v1" : "historique-v1";
}
