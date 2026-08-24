import express from "express";
import {
  BOOK_FORMAT,
  BOOK_QUESTIONS,
  MAX_REFERENCE_PHOTOS,
  PHOTO_ROLES,
  PHOTO_STORY_ROLES,
} from "../config/questionnaire.js";
import { ILLUSTRATION_STYLES, RENDERING_MODES } from "../config/illustrationStyles.js";
import { buildReadingGuidanceProfiles } from "../config/readingGuidance.js";
import {
  PAGE_COUNT_OPTIONS,
  PRINT_PAGE_PRICE_EUR,
  PRODUCT_TYPES,
  TYPOGRAPHY_OPTIONS,
  UNIVERSE_OPTIONS,
} from "../config/bookOptions.js";
import { getProductAvailability } from "../config/productAvailability.js";
import { availableBookFormats, bookFormatV1Enabled, publicBookFormat } from "../config/bookFormats.js";
import {
  calculateVersionedEbookPrice,
  ebookUnitPriceForVersion,
  pricingVersionForNewBook,
} from "../config/productPricing.js";
import { previewGenerationContract } from "../config/previewPricing.js";

const router = express.Router();

router.get("/questionnaire", (req, res) => {
  const pricingVersion = pricingVersionForNewBook();
  const ebookUnitPagePrice = ebookUnitPriceForVersion(pricingVersion);
  res.json({
    questions: BOOK_QUESTIONS,
    photos: {
      max: MAX_REFERENCE_PHOTOS,
      roles: PHOTO_ROLES,
      storyRoles: PHOTO_STORY_ROLES,
    },
    bookFormat: { ...BOOK_FORMAT, ...publicBookFormat("square_21") },
    bookFormats: availableBookFormats().map(publicBookFormat),
    bookFormatV1Enabled: bookFormatV1Enabled(),
    pricing: {
      currency: "EUR",
      unitPagePrice: PRINT_PAGE_PRICE_EUR,
      printUnitPagePrice: PRINT_PAGE_PRICE_EUR,
      ebookUnitPagePrice,
      generationUnitPagePrice: previewGenerationContract(PAGE_COUNT_OPTIONS[0].pageCount, pricingVersion).unitPagePriceEur,
      pricingVersion,
      taxIncluded: true,
    },
    productTypes: PRODUCT_TYPES,
    productAvailability: getProductAvailability(),
    pageCountOptions: PAGE_COUNT_OPTIONS.map((option) => ({
      ...option,
      ebookPriceEur: calculateVersionedEbookPrice(option.pageCount, pricingVersion),
      generationPriceEur: previewGenerationContract(option.pageCount, pricingVersion).requiredCents / 100,
    })),
    readingGuidanceProfiles: buildReadingGuidanceProfiles(),
    typographyOptions: TYPOGRAPHY_OPTIONS,
    universeOptions: UNIVERSE_OPTIONS,
    renderingModes: RENDERING_MODES,
    illustrationStyles: ILLUSTRATION_STYLES.map(({ id, renderingMode, likeness, name, description, palette, previewImage, referenceImage }) => ({
      id,
      renderingMode,
      likeness,
      name,
      description,
      palette,
      previewImage,
      referenceImage,
    })),
  });
});

export default router;
