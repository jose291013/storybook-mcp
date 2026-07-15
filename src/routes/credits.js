import express from "express";
import { previewEntitlementsEnabled, previewPriceCents } from "../config/previewPricing.js";
import { creditStore } from "../services/creditStore.js";
import { readWooCustomer } from "../services/draftIdentity.js";
import { projectStore } from "../services/projectStore.js";

const router = express.Router();

function requireIdentity(req, res) {
  try {
    const identity = readWooCustomer(req);
    if (!identity) res.status(401).json({ error: "Authentication required" });
    return identity;
  } catch (error) { res.status(401).json({ error: String(error?.message || error) }); return null; }
}

async function ownedProject(identity, projectId) {
  return projectId ? projectStore.getForCustomer(projectId, identity) : null;
}

router.get("/credits/summary", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  try {
    const projectId = String(req.query.projectId || "");
    const project = await ownedProject(identity, projectId);
    if (projectId && !project) return res.status(404).json({ error: "Project not found" });
    const pageCount = project?.questionnaire?.page_count || project?.productConfiguration?.pageCount || 24;
    const summary = await creditStore.summary(identity, projectId || null);
    const requiredCents = previewPriceCents(pageCount);
    res.set("Cache-Control", "no-store");
    res.json({
      enabled: previewEntitlementsEnabled(), pageCount: Number(pageCount), requiredCents,
      ...summary, missingCents: Math.max(0, requiredCents - summary.balanceCents),
      buyCreditsUrl: process.env.WOOCOMMERCE_CREDITS_URL || "",
    });
  } catch (error) { res.status(500).json({ error: String(error?.message || error) }); }
});

router.post("/credits/redeem", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  try {
    const projectId = String(req.body?.projectId || "");
    if (!await ownedProject(identity, projectId)) return res.status(404).json({ error: "Project not found" });
    const result = await creditStore.redeem(identity, { code: req.body?.code, projectId });
    res.json(result);
  } catch (error) {
    const message = String(error?.message || error);
    res.status(/Invalid|already used/.test(message) ? 400 : 500).json({ error: message });
  }
});

export default router;

