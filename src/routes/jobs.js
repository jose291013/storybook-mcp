import express from "express";
import { getJob } from "../services/jobStore.js";
import { readWooCustomer } from "../services/draftIdentity.js";
import { projectStore } from "../services/projectStore.js";
import { generationRunStore } from "../services/generationRunStore.js";

const router = express.Router();

router.get("/jobs/:id", async (req, res) => {
  const localJob = getJob(req.params.id);
  const durableRun = await generationRunStore.getRun(req.params.id).catch(() => null);
  const projectId = localJob?.projectId || durableRun?.projectId;
  if (!localJob && !durableRun) return res.status(404).json({ error: "Job not found" });
  if (projectId) {
    let identity;
    try { identity = readWooCustomer(req); }
    catch (error) { return res.status(401).json({ error: String(error?.message || error) }); }
    if (!identity) return res.status(401).json({ error: "Authentication required" });
    const project = await projectStore.getForCustomer(projectId, identity);
    if (!project) return res.status(404).json({ error: "Job not found" });
  }
  if (durableRun) {
    const status = durableRun.status === "completed"
      ? "done"
      : durableRun.status === "waiting_input"
        ? "awaiting_visual_approval"
        : durableRun.status === "repair_pending"
          ? "quality_review_required"
        : durableRun.status === "failed"
          ? "failed"
          : durableRun.status;
    return res.json({
      ...(localJob || {}),
      id: durableRun.id,
      projectId: durableRun.projectId,
      kind: durableRun.kind,
      status,
      step: durableRun.currentStep || localJob?.step || "",
      error: durableRun.errorMessage || localJob?.error || undefined,
      createdAt: durableRun.createdAt,
      updatedAt: durableRun.updatedAt,
      durable: true,
    });
  }
  return res.json(localJob);
});

export default router;
