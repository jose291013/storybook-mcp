import path from "path";
import express from "express";
import { readWooCustomer } from "../services/draftIdentity.js";
import { familyShareStore } from "../services/familyShareStore.js";
import { readFamilyShareSession, setFamilyShareSession } from "../services/familyShareSession.js";
import { projectStore } from "../services/projectStore.js";
import { attachNarrationToManifest, buildInteractiveBookManifest, InteractiveBookUnavailableError } from "../services/interactiveBookManifest.js";
import { getDeliveryStorage } from "../services/deliveryStorage.js";
import { previewAssetKey } from "../services/previewAssetStorage.js";
import { commerceOrderStore } from "../services/commerceOrderStore.js";
import { narrationAsset } from "../services/narrationFulfillment.js";

const router = express.Router();
const SAFE_ID = /^[A-Za-z0-9-]{6,128}$/;
const SAFE_TOKEN = /^[A-Za-z0-9_-]{40,128}$/;
const ALLOWED_EXPIRY_DAYS = new Set([7, 30]);
const MAX_ACTIVE_SHARES = 3;

function requireIdentity(req, res) {
  try {
    const identity = readWooCustomer(req);
    if (!identity) res.status(401).json({ error: "Authentication required" });
    return identity;
  } catch {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
}

function shareUrl(token) {
  const baseUrl = String(process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, "");
  return `${baseUrl}/family/${encodeURIComponent(token)}`;
}

async function ownedProject(req, res) {
  const identity = requireIdentity(req, res); if (!identity) return null;
  const project = await projectStore.getForCustomer(req.params.id, identity);
  if (!project) res.status(404).json({ error: "Project not found" });
  return project;
}

function sharedManifest(book, share) {
  const ownerPrefix = `/api/projects/${encodeURIComponent(share.projectId)}/preview-assets/`;
  const narrationPrefix = `/api/projects/${encodeURIComponent(share.projectId)}/narration-assets/`;
  return {
    ...book,
    id: `family-${share.id}`,
    shared: true,
    scenes: book.scenes.map((scene) => {
      let sharedScene = scene;
      if (scene.image) {
        const pathname = new URL(scene.image, "http://localhost").pathname;
        if (!pathname.startsWith(ownerPrefix)) throw new Error("Shared illustration path is invalid");
        const filename = decodeURIComponent(path.posix.basename(pathname));
        sharedScene = { ...sharedScene, image: `/api/shared-books/${encodeURIComponent(share.id)}/assets/${encodeURIComponent(filename)}` };
      }
      if (scene.audio) {
        const pathname = new URL(scene.audio, "http://localhost").pathname;
        if (!pathname.startsWith(narrationPrefix)) throw new Error("Shared narration path is invalid");
        const filename = decodeURIComponent(path.posix.basename(pathname));
        sharedScene = { ...sharedScene, audio: `/api/shared-books/${encodeURIComponent(share.id)}/narration-assets/${encodeURIComponent(filename)}` };
      }
      return sharedScene;
    }),
  };
}

async function activeGuestShare(req, res) {
  const session = readFamilyShareSession(req);
  if (!session || session.shareId !== req.params.shareId) {
    res.status(401).json({ error: "Family invitation required" }); return null;
  }
  const share = await familyShareStore.getActive(session.shareId);
  if (!share || share.projectId !== session.projectId) {
    res.status(410).json({ error: "This family invitation has expired or was revoked" }); return null;
  }
  if (!await commerceOrderStore.hasPaidEbookPurchase({ projectId: share.projectId, customerId: share.customerId })) {
    res.status(410).json({ error: "This family invitation is no longer available" }); return null;
  }
  return share;
}

router.get("/api/projects/:id/family-shares", async (req, res) => {
  try {
    const project = await ownedProject(req, res); if (!project) return;
    const shares = await familyShareStore.list(project.id, project.customerId);
    res.set("Cache-Control", "private, no-store");
    res.json({ shares, maxActiveShares: MAX_ACTIVE_SHARES });
  } catch (error) { res.status(500).json({ error: String(error?.message || error) }); }
});

router.post("/api/projects/:id/family-shares", async (req, res) => {
  try {
    const project = await ownedProject(req, res); if (!project) return;
    if (!await commerceOrderStore.hasPaidEbookPurchase({ projectId: project.id, customerId: project.customerId })) {
      return res.status(403).json({ error: "Purchase the eBook before sharing it with family", code: "ebook_purchase_required" });
    }
    buildInteractiveBookManifest(project);
    const expiresInDays = Number.parseInt(req.body?.expiresInDays || "30", 10);
    if (!ALLOWED_EXPIRY_DAYS.has(expiresInDays)) return res.status(400).json({ error: "Choose a 7 or 30 day invitation" });
    if (await familyShareStore.activeCount(project.id, project.customerId) >= MAX_ACTIVE_SHARES) {
      return res.status(409).json({ error: "Revoke an existing invitation before creating another one", code: "family_share_limit" });
    }
    const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();
    const created = await familyShareStore.create({ projectId: project.id, customerId: project.customerId, expiresAt });
    res.status(201).set("Cache-Control", "private, no-store").json({
      share: created.share,
      shareUrl: shareUrl(created.token),
      warning: "This private link is shown only once. Create a new invitation if it is lost.",
    });
  } catch (error) {
    if (error instanceof InteractiveBookUnavailableError) return res.status(409).json({ error: "Interactive book is not ready", issues: error.issues });
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.delete("/api/projects/:id/family-shares/:shareId", async (req, res) => {
  try {
    const project = await ownedProject(req, res); if (!project) return;
    if (!SAFE_ID.test(req.params.shareId)) return res.status(400).json({ error: "Invalid invitation" });
    const share = await familyShareStore.revoke(req.params.shareId, project.id, project.customerId);
    if (!share) return res.status(404).json({ error: "Invitation not found" });
    res.json({ share });
  } catch (error) { res.status(500).json({ error: String(error?.message || error) }); }
});

router.get("/family/:token", async (req, res) => {
  try {
    if (!SAFE_TOKEN.test(req.params.token)) return res.status(404).send("Invitation introuvable");
    const share = await familyShareStore.exchange(req.params.token);
    if (!share) return res.status(410).send("Cette invitation familiale a expiré ou a été désactivée.");
    setFamilyShareSession(req, res, share);
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    res.redirect(302, `/interactive-reader/?share=${encodeURIComponent(share.id)}`);
  } catch (error) { res.status(500).send(String(error?.message || error)); }
});

router.get("/api/shared-books/:shareId/interactive-book", async (req, res) => {
  try {
    const share = await activeGuestShare(req, res); if (!share) return;
    const project = await projectStore.get(share.projectId);
    if (!project) return res.status(404).json({ error: "Book not found" });
    const narration = await commerceOrderStore.findReadyNarration({ projectId: project.id, customerId: project.customerId });
    const ownerBook = attachNarrationToManifest(
      buildInteractiveBookManifest(project),
      narration,
      (filename) => `/api/projects/${encodeURIComponent(project.id)}/narration-assets/${encodeURIComponent(filename)}`,
    );
    const book = sharedManifest(ownerBook, share);
    res.set({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive" });
    res.json({ book });
  } catch (error) {
    if (error instanceof InteractiveBookUnavailableError) return res.status(409).json({ error: "Interactive book is not ready", issues: error.issues });
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get("/api/shared-books/:shareId/assets/:filename", async (req, res) => {
  try {
    const share = await activeGuestShare(req, res); if (!share) return;
    const asset = await getDeliveryStorage().get(previewAssetKey(share.projectId, req.params.filename));
    res.set({
      "Cache-Control": "private, no-store", "Content-Type": asset.contentType || "image/png",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive",
    });
    if (asset.byteSize > 0) res.set("Content-Length", String(asset.byteSize));
    if (Buffer.isBuffer(asset.body)) return res.end(asset.body);
    asset.body.on("error", () => { if (!res.headersSent) res.status(502); res.end(); });
    asset.body.pipe(res);
  } catch {
    if (!res.headersSent) res.status(404); res.end();
  }
});

router.get("/api/shared-books/:shareId/narration-assets/:filename", async (req, res) => {
  try {
    const share = await activeGuestShare(req, res); if (!share) return;
    const narration = await commerceOrderStore.findReadyNarration({ projectId: share.projectId, customerId: share.customerId });
    const scene = narrationAsset(narration, req.params.filename);
    if (!scene) return res.status(404).end();
    const asset = await getDeliveryStorage().get(scene.storageKey);
    res.set({
      "Cache-Control": "private, no-store", "Content-Type": asset.contentType || "audio/mpeg",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive",
    });
    if (asset.byteSize > 0) res.set("Content-Length", String(asset.byteSize));
    if (Buffer.isBuffer(asset.body)) return res.end(asset.body);
    asset.body.on("error", () => { if (!res.headersSent) res.status(502); res.end(); });
    asset.body.pipe(res);
  } catch {
    if (!res.headersSent) res.status(404); res.end();
  }
});

export default router;
