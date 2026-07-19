import express from "express";
import multer from "multer";
import { MAX_REFERENCE_PHOTOS } from "../config/questionnaire.js";
import { persistReferencePhoto } from "../services/referencePhotoStorage.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_REFERENCE_PHOTOS,
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return cb(new Error("Only JPG, PNG and WEBP image files are allowed"));
    }
    cb(null, true);
  },
});

router.post(
  "/upload",
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "photos", maxCount: MAX_REFERENCE_PHOTOS },
  ]),
  async (req, res) => {
    const files = [...(req.files?.photo || []), ...(req.files?.photos || [])];
    if (!files.length) {
      return res.status(400).json({ error: "No image uploaded (use 'photo' or 'photos')" });
    }
    if (files.length > MAX_REFERENCE_PHOTOS) {
      return res.status(400).json({ error: `A maximum of ${MAX_REFERENCE_PHOTOS} photos is allowed` });
    }

    let uploaded;
    try {
      uploaded = [];
      for (const file of files) {
        uploaded.push({
          ...(await persistReferencePhoto({ body: file.buffer })),
          originalName: file.originalname,
        });
      }
    } catch (error) {
      return res.status(500).json({ error: `Unable to store reference photo privately: ${String(error?.message || error)}` });
    }

    res.json({
      photos: uploaded,
      heroPhotoId: uploaded[0]?.id,
    });
  }
);

router.use((error, req, res, next) => {
  if (!(error instanceof multer.MulterError) && !/image files are allowed/i.test(String(error?.message || ""))) {
    return next(error);
  }
  const status = error?.code === "LIMIT_FILE_SIZE" ? 413 : 400;
  return res.status(status).json({ error: String(error?.message || "Unable to upload reference photos") });
});

export default router;
