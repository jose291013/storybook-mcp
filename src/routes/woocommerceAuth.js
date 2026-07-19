import express from "express";
import {
  clearWooCustomerSession,
  createWooAuthState,
  ensureDraftOwner,
  readWooCustomer,
  setWooCustomerSession,
  verifyWooAuthState,
  verifyWooCustomerToken,
} from "../services/draftIdentity.js";
import { projectStore } from "../services/projectStore.js";

const router = express.Router();

function currentIdentity(req) {
  try { return readWooCustomer(req); }
  catch { return null; }
}

function safeReturnPath(projectId, status = "connected", destination = "creator") {
  const params = new URLSearchParams({ auth: status, project: projectId });
  if (destination === "interactive_reader") return `/interactive-reader/?${params.toString()}`;
  return `/?${params.toString()}#creator`;
}

router.get("/auth/session", (req, res) => {
  const identity = currentIdentity(req);
  res.set("Cache-Control", "no-store");
  res.json({
    authenticated: Boolean(identity),
    customer: identity ? { wooCustomerId: identity.wooCustomerId, email: identity.email } : null,
  });
});

router.get("/auth/woocommerce/reader", (req, res) => {
  const projectId = String(req.query.projectId || "").trim();
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(projectId)) return res.status(400).send("Invalid project id");
  if (!process.env.WOOCOMMERCE_BRIDGE_URL || !process.env.WOOCOMMERCE_BRIDGE_SECRET) {
    return res.status(503).send("WooCommerce authentication is not configured");
  }
  const state = createWooAuthState({ projectId, destination: "interactive_reader" });
  const bridgeUrl = new URL(process.env.WOOCOMMERCE_BRIDGE_URL);
  bridgeUrl.searchParams.set("state", state);
  res.set("Cache-Control", "no-store");
  return res.redirect(302, bridgeUrl.toString());
});

router.get("/auth/woocommerce/project", (req, res) => {
  const projectId = String(req.query.projectId || "").trim();
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(projectId)) return res.status(400).send("Invalid project id");
  if (!process.env.WOOCOMMERCE_BRIDGE_URL || !process.env.WOOCOMMERCE_BRIDGE_SECRET) {
    return res.status(503).send("WooCommerce authentication is not configured");
  }
  const state = createWooAuthState({ projectId, destination: "creator" });
  const bridgeUrl = new URL(process.env.WOOCOMMERCE_BRIDGE_URL);
  bridgeUrl.searchParams.set("state", state);
  res.set("Cache-Control", "no-store");
  return res.redirect(302, bridgeUrl.toString());
});

router.get("/auth/woocommerce/start", async (req, res) => {
  try {
    const projectId = String(req.query.projectId || "");
    const owner = ensureDraftOwner(req, res);
    const project = await projectStore.get(projectId);
    if (!project) return res.status(404).send("Draft not found");

    const identity = currentIdentity(req);
    if (identity) {
      const owned = project.anonymousOwnerHash === owner.ownerHash
        ? await projectStore.claim(projectId, owner.ownerHash, identity)
        : await projectStore.getForCustomer(projectId, identity);
      if (!owned) return res.status(403).send("Draft access denied");
      return res.redirect(302, safeReturnPath(projectId));
    }

    if (project.anonymousOwnerHash !== owner.ownerHash) return res.status(403).send("Draft access denied");
    if (!process.env.WOOCOMMERCE_BRIDGE_URL || !process.env.WOOCOMMERCE_BRIDGE_SECRET) {
      return res.status(503).send("WooCommerce authentication is not configured");
    }

    const state = createWooAuthState({ projectId });
    const bridgeUrl = new URL(process.env.WOOCOMMERCE_BRIDGE_URL);
    bridgeUrl.searchParams.set("state", state);
    res.set("Cache-Control", "no-store");
    return res.redirect(302, bridgeUrl.toString());
  } catch (error) {
    return res.status(400).send(String(error?.message || error));
  }
});

router.get("/auth/woocommerce/callback", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const state = verifyWooAuthState(String(req.query.state || ""));
    const identity = verifyWooCustomerToken(String(req.query.token || ""));
    if (!identity) throw new Error("Missing customer identity");

    let project = await projectStore.getForCustomer(state.projectId, identity);
    if (!project) {
      const owner = ensureDraftOwner(req, res);
      project = await projectStore.claim(state.projectId, owner.ownerHash, identity);
    }
    if (!project) return res.status(403).send("Draft access denied");

    setWooCustomerSession(req, res, identity);
    return res.redirect(302, safeReturnPath(state.projectId, "connected", state.destination));
  } catch (error) {
    return res.status(401).send(`Authentication failed: ${String(error?.message || error)}`);
  }
});

router.post("/auth/logout", (req, res) => {
  clearWooCustomerSession(req, res);
  res.status(204).end();
});

export default router;
