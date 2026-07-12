import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { MAX_REFERENCE_PHOTOS } from "../config/questionnaire.js";

const router = express.Router();

const UPLOAD_DIR = path.resolve("data/uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  }
});

const upload = multer({
  storage,
  limits: {
    files: MAX_REFERENCE_PHOTOS,
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
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
  (req, res) => {
    const files = [...(req.files?.photo || []), ...(req.files?.photos || [])];
    if (!files.length) {
      return res.status(400).json({ error: "No image uploaded (use 'photo' or 'photos')" });
    }
    if (files.length > MAX_REFERENCE_PHOTOS) {
      return res.status(400).json({ error: `A maximum of ${MAX_REFERENCE_PHOTOS} photos is allowed` });
    }

    const uploaded = files.map((file) => ({
      id: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    }));

    res.json({
      photos: uploaded,
      heroPhotoId: uploaded[0]?.id,
    });
  }
);

export default router;
