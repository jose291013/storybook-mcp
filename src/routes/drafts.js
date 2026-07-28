import express from "express";
import { ensureDraftOwner, readWooCustomer } from "../services/draftIdentity.js";
import { projectStore } from "../services/projectStore.js";
import { getDeliveryStorage } from "../services/deliveryStorage.js";
import { previewAssetKey } from "../services/previewAssetStorage.js";
import { attachNarrationToManifest, buildInteractiveBookManifest, InteractiveBookUnavailableError } from "../services/interactiveBookManifest.js";
import { commerceOrderStore } from "../services/commerceOrderStore.js";
import { normalizeReferencePhotos } from "../services/normalizeBookRequest.js";
import { sanitizeSensitivityQuestionnaire } from "../services/storySensitivity.js";
import {
  childSafetyTextFromQuestionnaire,
  guardChildSafety,
} from "../services/childSafety.js";
import { loadReferencePhoto, loadReferencePhotoAssets, MissingReferencePhotoError } from "../services/referencePhotoStorage.js";
import { createNextAdventure, SeriesPurchaseRequiredError } from "../services/seriesService.js";
import { referencePhotoRecoveryAvailable, technicalReferenceRetryAvailable } from "../services/referencePhotoRecovery.js";
import {
  technicalPreviewRetryAvailable,
  technicalPreviewRetryExhausted,
} from "../services/previewGenerationCheckpoint.js";

const router = express.Router();

async function safeQuestionnaire(questionnaire, locale, scope) {
  const input = questionnaire && typeof questionnaire === "object" ? questionnaire : {};
  const result = await guardChildSafety({
    text: childSafetyTextFromQuestionnaire(input),
    childAge: Number(input.age),
    locale: ["FR", "ES", "EN"].includes(locale) ? locale : "FR",
    scope,
  }, {
    onTrace: (trace) => console.info("child-safety assessed", trace),
    onError: (error) => console.warn("child-safety deterministic fallback", {
      scope,
      error: String(error?.message || error),
    }),
  });
  if (result.intervention) return { intervention: result.intervention, questionnaire: null };
  return {
    intervention: null,
    questionnaire: sanitizeSensitivityQuestionnaire({
      ...input,
      ...(result.profile ? { child_safety_profile: result.profile } : {}),
    }),
  };
}

function sendSafetyIntervention(res, intervention) {
  return res.status(intervention.status).json({
    error: intervention.code,
    ...intervention,
  });
}

function publicProject(project) {
  if (!project) return null;
  const { anonymousOwnerHash, customerId, ...safe } = project;
  return {
    ...safe,
    referenceRecoveryAvailable: referencePhotoRecoveryAvailable(project),
    technicalReferenceRetryAvailable: technicalReferenceRetryAvailable(project),
    technicalPreviewRetryAvailable: technicalPreviewRetryAvailable(project),
    technicalPreviewRetryExhausted: technicalPreviewRetryExhausted(project),
  };
}

router.post("/projects/:id/preview-notification", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  try {
    const project = await projectStore.getForCustomer(req.params.id, identity);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const current = project.continuitySnapshot?.previewNotification || {};
    const continuitySnapshot = {
      ...project.continuitySnapshot,
      previewNotification: {
        ...current,
        emailRequested: req.body?.email === true,
        requestedAt: new Date().toISOString(),
      },
    };
    const updated = await projectStore.updateForCustomer(project.id, identity, { continuitySnapshot });
    res.json({ notification: updated.continuitySnapshot.previewNotification });
  } catch (error) { res.status(500).json({ error: String(error?.message || error) }); }
});

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
    const safety = await safeQuestionnaire(body.questionnaire, body.locale, "draft_create");
    if (safety.intervention) return sendSafetyIntervention(res, safety.intervention);
    const project = await projectStore.create({
      anonymousOwnerHash: owner.ownerHash, status: body.status || "draft",
      title: body.title || body.questionnaire?.hero_name || "", locale: body.locale || "FR",
      questionnaire: safety.questionnaire, photoRefs: body.photos || [],
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
    const safety = body.questionnaire === undefined
      ? null
      : await safeQuestionnaire(body.questionnaire, body.locale || existing.locale, "draft_update");
    if (safety?.intervention) return sendSafetyIntervention(res, safety.intervention);
    const project = await projectStore.update(existing.id, {
      status: body.status, title: body.title, locale: body.locale,
      questionnaire: body.questionnaire === undefined ? undefined : safety.questionnaire,
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

router.post("/projects/:id/next-adventure", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  try {
    const sourceProject = await projectStore.getForCustomer(req.params.id, identity);
    if (!sourceProject) return res.status(404).json({ error: "Project not found" });
    const result = await createNextAdventure({ sourceProject });
    res.status(result.reused ? 200 : 201).json({
      project: publicProject(result.project),
      reused: result.reused,
      series: result.series ? { id: result.series.id, title: result.series.title } : null,
    });
  } catch (error) {
    if (error instanceof SeriesPurchaseRequiredError) {
      return res.status(403).json({ error: error.message, code: error.code });
    }
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get("/projects/:id/reference-photos/:photoId", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  try {
    const project = await projectStore.getForCustomer(req.params.id, identity);
    if (!project) return res.status(404).end();
    const photo = (project.photoRefs || []).find((item) => String(item.id) === String(req.params.photoId));
    if (!photo) return res.status(404).end();
    const asset = await loadReferencePhoto(photo);
    res.set({
      "Cache-Control": "private, no-store",
      "Content-Type": asset.mimeType || "image/jpeg",
      "Content-Length": String(asset.buffer.length),
      "X-Content-Type-Options": "nosniff",
    });
    res.end(asset.buffer);
  } catch {
    res.status(404).end();
  }
});

router.post("/projects/:id/reference-recovery", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  try {
    const project = await projectStore.getForCustomer(req.params.id, identity);
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (!referencePhotoRecoveryAvailable(project)) {
      return res.status(409).json({ error: "This project is not eligible for the legacy reference-photo recovery" });
    }
    const photos = normalizeReferencePhotos({ photos: req.body?.photos || [] });
    if (!photos.length) return res.status(400).json({ error: "At least one replacement reference photo is required" });
    await loadReferencePhotoAssets(photos);
    const requestedAt = new Date().toISOString();
    const continuitySnapshot = {
      ...project.continuitySnapshot,
      referenceRecovery: {
        available: true,
        requestedAt,
        reason: "legacy_ephemeral_reference_photos",
        previousGenerationJobId: project.generationJobId || null,
        previousReferenceCount: Array.isArray(project.photoRefs) ? project.photoRefs.length : 0,
      },
    };
    const updated = await projectStore.updateForCustomer(project.id, identity, {
      status: "ready_for_preview",
      photoRefs: photos,
      continuitySnapshot,
      generationJobId: null,
    });
    res.json({ project: publicProject(updated), retryIsFree: true });
  } catch (error) {
    if (error instanceof MissingReferencePhotoError) {
      return res.status(409).json({ error: error.message, code: error.code, missingPhotoIds: error.missingPhotoIds });
    }
    res.status(400).json({ error: String(error?.message || error) });
  }
});

router.get("/projects/:id/interactive-book", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  try {
    const project = await projectStore.getForCustomer(req.params.id, identity);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const narration = await commerceOrderStore.findReadyNarration({ projectId: project.id, customerId: project.customerId });
    const book = attachNarrationToManifest(
      buildInteractiveBookManifest(project),
      narration,
      (filename) => `/api/projects/${encodeURIComponent(project.id)}/narration-assets/${encodeURIComponent(filename)}`,
    );
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
    const existing = await projectStore.getForCustomer(req.params.id, identity);
    if (!existing) return res.status(404).json({ error: "Project not found" });
    const safety = body.questionnaire === undefined
      ? null
      : await safeQuestionnaire(body.questionnaire, body.locale || existing.locale, "project_update");
    if (safety?.intervention) return sendSafetyIntervention(res, safety.intervention);
    const project = await projectStore.updateForCustomer(req.params.id, identity, {
      status: body.status, title: body.title, locale: body.locale,
      questionnaire: body.questionnaire === undefined ? undefined : safety.questionnaire,
      photoRefs: body.photos, productConfiguration: body.productConfiguration,
    });
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json({ project: publicProject(project) });
  } catch (error) { res.status(500).json({ error: String(error?.message || error) }); }
});

export default router;
