import express from "express";
import {
  BOOK_FORMAT,
  BOOK_QUESTIONS,
  MAX_REFERENCE_PHOTOS,
  PHOTO_ROLES,
  PHOTO_STORY_ROLES,
} from "../config/questionnaire.js";
import { ILLUSTRATION_STYLES, RENDERING_MODES } from "../config/illustrationStyles.js";
import {
  EBOOK_PAGE_PRICE_EUR,
  PAGE_COUNT_OPTIONS,
  PRINT_PAGE_PRICE_EUR,
  PRODUCT_TYPES,
  TYPOGRAPHY_OPTIONS,
  UNIVERSE_OPTIONS,
} from "../config/bookOptions.js";
import { getProductAvailability } from "../config/productAvailability.js";

const router = express.Router();

router.get("/questionnaire", (req, res) => {
  res.json({
    questions: BOOK_QUESTIONS,
    photos: {
      max: MAX_REFERENCE_PHOTOS,
      roles: PHOTO_ROLES,
      storyRoles: PHOTO_STORY_ROLES,
    },
    bookFormat: BOOK_FORMAT,
    pricing: {
      currency: "EUR",
      unitPagePrice: PRINT_PAGE_PRICE_EUR,
      printUnitPagePrice: PRINT_PAGE_PRICE_EUR,
      ebookUnitPagePrice: EBOOK_PAGE_PRICE_EUR,
    },
    productTypes: PRODUCT_TYPES,
    productAvailability: getProductAvailability(),
    pageCountOptions: PAGE_COUNT_OPTIONS,
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
