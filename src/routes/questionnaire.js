import express from "express";
import {
  BOOK_FORMAT,
  BOOK_QUESTIONS,
  MAX_REFERENCE_PHOTOS,
  PHOTO_ROLES,
} from "../config/questionnaire.js";
import { ILLUSTRATION_STYLES } from "../config/illustrationStyles.js";

const router = express.Router();

router.get("/questionnaire", (req, res) => {
  res.json({
    questions: BOOK_QUESTIONS,
    photos: {
      max: MAX_REFERENCE_PHOTOS,
      roles: PHOTO_ROLES,
    },
    bookFormat: BOOK_FORMAT,
    illustrationStyles: ILLUSTRATION_STYLES.map(({ id, name, description, palette }) => ({
      id,
      name,
      description,
      palette,
    })),
  });
});

export default router;
