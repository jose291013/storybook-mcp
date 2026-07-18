import express from "express";
import { ensureDraftOwner, readWooCustomer } from "../services/draftIdentity.js";
import { projectStore } from "../services/projectStore.js";
import { getDeliveryStorage } from "../services/deliveryStorage.js";
import { previewAssetKey } from "../services/previewAssetStorage.js";
import { buildInteractiveBookManifest, InteractiveBookUnavailableError } from "../services/interactiveBookManifest.js";

const router = express.Router();

function publicProject(project) {
  if (!project) return null;
  const { anonymousOwnerHash, customerId, ...safe } = project;
  return safe;
}

function requireIdentity(req, res) {
  try {
    const identity = readWooCustomer(req);
    if (!identity) res.status(401).json({ error: "Authentication required" });
    return identity;
  } catch (error) {
    res.status(401).json({ error: String(error?.message || error) });
    return null;
  }
}

router.post("/drafts", async (req, res) => {
  try {
    const owner = ensureDraftOwner(req, res);
    const body = req.body || {};
    const project = await projectStore.create({
      anonymousOwnerHash: owner.ownerHash, status: body.status || "draft",
      title: body.title || body.questionnaire?.hero_name || "", locale: body.locale || "FR",
      questionnaire: body.questionnaire || {}, photoRefs: body.photos || [],
      productConfiguration: body.productConfiguration || {},
    });
    res.status(201).json({ project: publicProject(project) });
  } catch (error) { res.status(500).json({ error: String(error?.message || error) }); }
});

router.get("/drafts/:id", async (req, res) => {
  try {
    const owner = ensureDraftOwner(req, res); const project = await projectStore.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Draft not found" });
    if (project.anonymousOwnerHash !== owner.ownerHash) return res.status(403).json({ error: "Draft access denied" });
    res.json({ project: publicProject(project) });
  } catch (error) { res.status(500).json({ error: String(error?.message || error) }); }
});

router.put("/drafts/:id", async (req, res) => {
  try {
    const owner = ensureDraftOwner(req, res); const existing = await projectStore.get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Draft not found" });
    if (existing.anonymousOwnerHash !== owner.ownerHash) return res.status(403).json({ error: "Draft access denied" });
    const body = req.body || {};
    const project = await projectStore.update(existing.id, {
      status: body.status, title: body.title, locale: body.locale, questionnaire: body.questionnaire,
      photoRefs: body.photos, productConfiguration: body.productConfiguration,
    });
    res.json({ project: publicProject(project) });
  } catch (error) { res.status(500).json({ error: String(error?.message || error) }); }
});

router.post("/drafts/:id/claim", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  try {
    const owner = ensureDraftOwner(req, res);
    const project = await projectStore.claim(req.params.id, owner.ownerHash, identity);
    if (!project) return res.status(404).json({ error: "Owned draft not found" });
    res.json({ project: publicProject(project) });
  } catch (error) { res.status(500).json({ error: String(error?.message || error) }); }
});

router.get("/projects", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  try {
    const projects = await projectStore.listForCustomer(identity);
    res.json({ projects: projects.map(publicProject) });
  } catch (error) { res.status(500).json({ error: String(error?.message || error) }); }
});

router.get("/projects/:id", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  try {
    const project = await projectStore.getForCustomer(req.params.id, identity);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json({ project: publicProject(project) });
  } catch (error) { res.status(500).json({ error: String(error?.message || error) }); }
});

router.get("/projects/:id/interactive-book", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  try {
    const project = await projectStore.getForCustomer(req.params.id, identity);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const book = buildInteractiveBookManifest(project);
    res.set("Cache-Control", "private, no-store");
    res.json({ book });
  } catch (error) {
    if (error instanceof InteractiveBookUnavailableError) {
      return res.status(409).json({ error: "Interactive book is not ready", issues: error.issues });
    }
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get("/projects/:id/preview-assets/:filename", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  try {
    const project = await projectStore.getForCustomer(req.params.id, identity);
    if (!project) return res.status(404).end();
    const storageKey = previewAssetKey(project.id, req.params.filename);
    const asset = await getDeliveryStorage().get(storageKey);
    res.set({
      "Cache-Control": "private, no-store",
      "Content-Type": asset.contentType || "image/png",
      "X-Content-Type-Options": "nosniff",
    });
    if (asset.byteSize > 0) res.set("Content-Length", String(asset.byteSize));
    if (Buffer.isBuffer(asset.body)) return res.end(asset.body);
    asset.body.on("error", () => { if (!res.headersSent) res.status(502); res.end(); });
    asset.body.pipe(res);
  } catch (error) {
    if (!res.headersSent) res.status(404);
    res.end();
  }
});

router.put("/projects/:id", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  try {
    const body = req.body || {};
    const project = await projectStore.updateForCustomer(req.params.id, identity, {
      status: body.status, title: body.title, locale: body.locale, questionnaire: body.questionnaire,
      photoRefs: body.photos, productConfiguration: body.productConfiguration,
    });
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json({ project: publicProject(project) });
  } catch (error) { res.status(500).json({ error: String(error?.message || error) }); }
});

export default router;
