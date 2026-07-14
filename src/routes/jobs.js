import express from "express";
import { getJob } from "../services/jobStore.js";
import { readWooCustomer } from "../services/draftIdentity.js";
import { projectStore } from "../services/projectStore.js";

const router = express.Router();

router.get("/jobs/:id", async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  if (job.projectId) {
    let identity;
    try { identity = readWooCustomer(req); }
    catch (error) { return res.status(401).json({ error: String(error?.message || error) }); }
    if (!identity) return res.status(401).json({ error: "Authentication required" });
    const project = await projectStore.getForCustomer(job.projectId, identity);
    if (!project) return res.status(404).json({ error: "Job not found" });
  }
  res.json(job);
});

export default router;
