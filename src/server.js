import express from "express";
import previewRouter from "./routes/preview.js";
import jobsRouter from "./routes/jobs.js";
import uploadRouter from "./routes/upload.js";
import finalizeRouter from "./routes/finalize.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

// Serve generated images
app.use("/outputs", express.static("data/outputs"));

// Uploads
app.use("/api", uploadRouter);
app.use("/uploads", express.static("data/uploads"));

// Health check (Render)
app.get("/health", (req, res) => res.json({ ok: true }));

// Routes
app.use("/api", previewRouter);
app.use("/api", finalizeRouter);
app.use("/api", jobsRouter);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Server listening on port ${port}`);
});
