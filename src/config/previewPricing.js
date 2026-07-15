import { normalizePageCount } from "./bookOptions.js";

export const PREVIEW_PRICE_CENTS_BY_PAGE_COUNT = Object.freeze({
  24: 250,
  28: 300,
  32: 350,
  36: 400,
  40: 450,
  44: 500,
});

export function previewPriceCents(pageCount) {
  return PREVIEW_PRICE_CENTS_BY_PAGE_COUNT[normalizePageCount(pageCount)];
}

export function previewEntitlementsEnabled() {
  return String(process.env.PREVIEW_ENTITLEMENTS_ENABLED || "false").toLowerCase() === "true";
}

