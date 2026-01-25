import express from "express";
import { getJob } from "../services/jobStore.js";

const router = express.Router();

router.get("/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});

export default router;
