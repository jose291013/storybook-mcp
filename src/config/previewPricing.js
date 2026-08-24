import { normalizePageCount } from "./bookOptions.js";
import {
  DIGITAL_PRICING_VERSION_V1,
  normalizePricingVersion,
} from "./productPricing.js";

export const LEGACY_PREVIEW_PRICE_CENTS_BY_PAGE_COUNT = Object.freeze({
  24: 250,
  28: 300,
  32: 350,
  36: 400,
  40: 450,
  44: 500,
});

export const GENERATION_PAGE_PRICE_EUR_V1 = 0.185;
export const PREVIEW_PRICE_CENTS_BY_PAGE_COUNT = Object.freeze({
  24: 444,
  28: 518,
  32: 592,
  36: 666,
  40: 740,
  44: 814,
});

export function previewPriceCents(pageCount, pricingVersion) {
  const prices = normalizePricingVersion(pricingVersion) === DIGITAL_PRICING_VERSION_V1
    ? PREVIEW_PRICE_CENTS_BY_PAGE_COUNT
    : LEGACY_PREVIEW_PRICE_CENTS_BY_PAGE_COUNT;
  return prices[normalizePageCount(pageCount)];
}

export function previewGenerationContract(pageCount, pricingVersion) {
  const normalizedPageCount = normalizePageCount(pageCount);
  const v1 = normalizePricingVersion(pricingVersion) === DIGITAL_PRICING_VERSION_V1;
  const requiredCents = previewPriceCents(normalizedPageCount, pricingVersion);
  return Object.freeze({
    version: v1 ? "generation_ttc_0185_v1" : "generation_legacy_v1",
    pageCount: normalizedPageCount,
    requiredCents,
    unitPagePriceEur: v1 ? GENERATION_PAGE_PRICE_EUR_V1 : null,
    interactiveReaderIncluded: !v1,
    temporaryInteractivePreviewIncluded: v1,
    previewAccessDurationHours: v1 ? 72 : null,
    purchaseCreditCents: v1 ? requiredCents : 0,
    permanentDigitalPurchaseIncludesInteractiveReader: true,
    permanentDigitalPurchaseIncludesPdf: true,
    ebookIncluded: false,
  });
}

export function previewEntitlementsEnabled() {
  return String(process.env.PREVIEW_ENTITLEMENTS_ENABLED || "false").toLowerCase() === "true";
}

