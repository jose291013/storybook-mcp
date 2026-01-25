import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";

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

const upload = multer({ storage });

router.post("/upload", upload.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded (field name must be 'photo')" });

  res.json({
    heroPhotoId: req.file.filename
  });
});

export default router;
