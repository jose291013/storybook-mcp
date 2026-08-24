import { calculateBookPrice, normalizePageCount, normalizeProductType } from "../config/bookOptions.js";
import { findBookFormat, LEGACY_BOOK_FORMAT_ID } from "../config/bookFormats.js";
import {
  calculateVersionedEbookPrice,
  ebookUnitPriceForVersion,
  LEGACY_DIGITAL_PRICING_VERSION,
  normalizePricingVersion,
  pricingVersionForNewBook,
} from "../config/productPricing.js";
import { previewGenerationContract } from "../config/previewPricing.js";

function contractFields(source = {}) {
  return {
    bookFormatId: source.book_format_id || source.bookFormatId,
    pricingVersion: source.pricing_version || source.pricingVersion,
  };
}
export function createBookProductContract({ requested = {}, env = process.env } = {}) {
  const format = findBookFormat(contractFields(requested).bookFormatId, { allowDisabled: false, env });
  const pricingVersion = pricingVersionForNewBook(env);
  return buildBookProductContract({ source: requested, formatId: format.id, pricingVersion });
}

export function existingBookProductContract(project = {}) {
  const questionnaire = project.questionnaire || {};
  const configuration = project.productConfiguration || {};
  const fields = contractFields({ ...questionnaire, ...configuration });
  return buildBookProductContract({
    source: { ...questionnaire, ...configuration },
    formatId: fields.bookFormatId || LEGACY_BOOK_FORMAT_ID,
    pricingVersion: fields.pricingVersion || LEGACY_DIGITAL_PRICING_VERSION,
  });
}

function buildBookProductContract({ source = {}, formatId, pricingVersion }) {
  const pageCount = normalizePageCount(source.page_count || source.pageCount || 24);
  const productType = normalizeProductType(source.product_type || source.productType || "ebook");
  const format = findBookFormat(formatId);
  const normalizedPricingVersion = normalizePricingVersion(pricingVersion);
  const unitPrice = productType === "ebook"
    ? ebookUnitPriceForVersion(normalizedPricingVersion)
    : 1.2458;
  const price = productType === "ebook"
    ? calculateVersionedEbookPrice(pageCount, normalizedPricingVersion)
    : calculateBookPrice(pageCount, "print");
  const generation = previewGenerationContract(pageCount, normalizedPricingVersion);
  return Object.freeze({
    version: 1,
    bookFormatId: format.id,
    pricingVersion: normalizedPricingVersion,
    pageCount,
    productType,
    unitPagePriceEur: unitPrice,
    priceEur: price,
    generationPricingVersion: generation.version,
    generationUnitPagePriceEur: generation.unitPagePriceEur,
    generationPriceEur: generation.requiredCents / 100,
    interactiveReaderIncluded: generation.interactiveReaderIncluded,
    ebookIncludedInGeneration: generation.ebookIncluded,
    wooVariationKey: `${productType}_${format.wooSlug}_${pageCount}_${normalizedPricingVersion}`,
  });
}

export function applyBookProductContract(source = {}, contract) {
  return {
    ...source,
    page_count: contract.pageCount,
    product_type: contract.productType,
    book_format_id: contract.bookFormatId,
    pricing_version: contract.pricingVersion,
    price_eur: contract.priceEur,
    unit_page_price_eur: contract.unitPagePriceEur,
    generation_pricing_version: contract.generationPricingVersion,
    generation_unit_page_price_eur: contract.generationUnitPagePriceEur,
    generation_price_eur: contract.generationPriceEur,
    interactive_reader_included: contract.interactiveReaderIncluded,
    ebook_included_in_generation: contract.ebookIncludedInGeneration,
    woo_variation_key: contract.wooVariationKey,
  };
}
