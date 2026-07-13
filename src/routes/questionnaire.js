import express from "express";
import {
  BOOK_FORMAT,
  BOOK_QUESTIONS,
  MAX_REFERENCE_PHOTOS,
  PHOTO_ROLES,
  PHOTO_STORY_ROLES,
} from "../config/questionnaire.js";
import { ILLUSTRATION_STYLES } from "../config/illustrationStyles.js";
import { PAGE_COUNT_OPTIONS, TYPOGRAPHY_OPTIONS, UNIVERSE_OPTIONS } from "../config/bookOptions.js";

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
    pageCountOptions: PAGE_COUNT_OPTIONS,
    typographyOptions: TYPOGRAPHY_OPTIONS,
    universeOptions: UNIVERSE_OPTIONS,
    illustrationStyles: ILLUSTRATION_STYLES.map(({ id, name, description, palette }) => ({
      id,
      name,
      description,
      palette,
    })),
  });
});

export default router;
