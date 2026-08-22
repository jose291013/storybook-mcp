import crypto from "crypto";
import express from "express";
import { composeBookPagePNG } from "../services/composeBookPagePNG.js";
import { creditStore, InsufficientCreditError } from "../services/creditStore.js";
import { readWooCustomer } from "../services/draftIdentity.js";
import { generateQualityCheckedImage } from "../services/imageQualityGate.js";
import { createJob, updateJob } from "../services/jobStore.js";
import { persistPreviewAsset } from "../services/previewAssetStorage.js";
import { previewRevisionStore } from "../services/previewRevisionStore.js";
import { projectStore } from "../services/projectStore.js";
import { buildSceneContinuity } from "../services/visualContinuity.js";
import { sceneContractImagePrompt } from "../agents/storyScenePlanner.js";
import { findIllustrationStyle } from "../config/illustrationStyles.js";
import { previewModificationPriceCents } from "../config/previewModificationPricing.js";
import { rewriteApprovedSpreadText } from "../services/rewriteApprovedSpreadText.js";
import { inspectPreviewModificationRequest } from "../services/previewModificationPolicy.js";
import { childSafetyResponse, guardChildSafety } from "../services/childSafety.js";
import { withOpenAICostContext } from "../services/openaiCostContext.js";
import { visualBibleCoverStorageKey } from "../services/visualBible.js";
import { adjacentApprovedIllustrationReferences } from "../services/adjacentVisualContinuity.js";
import { generationCheckpoint } from "../services/previewGenerationCheckpoint.js";
import { wardrobeVisualReferencesFromCheckpoint } from "../services/wardrobeVisualAuthorityV1.js";

const router = express.Router();
const runningModifications = new Set();
const ACTIVE_STATUSES = new Set(["reserved", "generating", "awaiting_approval"]);
const TEXT_TYPES = new Set(["text", "opening_text", "closing_text"]);

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

function fingerprint(project) {
  return crypto.createHash("sha256")
    .update(JSON.stringify({ finalBlueprint: project.finalBlueprint, previewResult: project.previewResult }))
    .digest("hex");
}

function eligibleSpreads(project) {
  const blueprintPages = Array.isArray(project.finalBlueprint?.pages) ? project.finalBlueprint.pages : [];
  const draftPages = Array.isArray(project.previewResult?.draftPages) ? project.previewResult.draftPages : [];
  const draftByNumber = new Map(draftPages.map((page) => [Number(page.page_number), page]));
  return blueprintPages
    .filter((page) => page.page_type === "image" && Number(page.spread_number) > 0)
    .map((imageBlueprint) => {
      const textBlueprint = blueprintPages.find((page) => (
        Number(page.spread_number) === Number(imageBlueprint.spread_number) && TEXT_TYPES.has(page.page_type)
      ));
      const imagePage = draftByNumber.get(Number(imageBlueprint.page_number));
      const textPage = draftByNumber.get(Number(textBlueprint?.page_number));
      if (!imagePage || !textPage) return null;
      return {
        spreadNumber: Number(imageBlueprint.spread_number),
        textPageNumber: Number(textPage.page_number),
        imagePageNumber: Number(imagePage.page_number),
        sceneTitle: String(imageBlueprint.scene_title || textBlueprint?.scene_title || ""),
        currentText: String(textPage.text || ""),
      };
    })
    .filter(Boolean);
}

function modificationView(modification, { includeCandidate = false } = {}) {
  if (!modification) return null;
  const {
    customerId, sourceSnapshot, sourceFingerprint, failureMessage, candidateSnapshot, ...safe
  } = modification;
  return {
    ...safe,
    failureMessage: failureMessage ? "La génération de cette proposition n’a pas abouti." : "",
    ...(includeCandidate && candidateSnapshot ? { candidateSnapshot } : {}),
  };
}

function validateReadyProject(project) {
  if (!project) return { status: 404, error: "Project not found" };
  if (project.status === "purchased") return { status: 409, error: "A purchased revision cannot be modified here" };
  if (project.status !== "preview_ready" || !project.previewResult || !project.finalBlueprint) {
    return { status: 409, error: "A completed unpurchased preview is required" };
  }
  return null;
}

function selectedSpread(project, spreadNumber) {
  return eligibleSpreads(project).find((spread) => spread.spreadNumber === Number(spreadNumber)) || null;
}

function failureCode(error) {
  if (["child_safety_blocked", "child_safety_support_required"].includes(error?.code)) return error.code;
  const message = String(error?.message || error).toLowerCase();
  if (message.includes("safety system") || message.includes("safety rejection")) return "image_safety_rejection";
  if (message.includes("timed out") || message.includes("timeout")) return "upstream_timeout";
  return "generation_failed";
}

function continuityStorageKey(project) {
  return visualBibleCoverStorageKey(project) || "";
}

async function regenerateSpreadIllustration({ project, spread, pairedText, instruction, modificationId, onAttempt }) {
  const imageBlueprint = project.finalBlueprint.pages.find((page) => Number(page.page_number) === spread.imagePageNumber);
  const characterCanons = Array.isArray(project.continuitySnapshot?.characterCanons)
    ? project.continuitySnapshot.characterCanons
    : [];
  const draftPages = project.previewResult?.draftPages || [];
  const currentPage = draftPages.find((page) => Number(page.page_number) === spread.imagePageNumber);
  const adjacentReferenceImages = adjacentApprovedIllustrationReferences({
    blueprintPages: project.finalBlueprint.pages,
    draftPages,
    currentPageNumber: spread.imagePageNumber,
    includeNext: true,
  });
  let continuity = buildSceneContinuity({
    blueprint: project.finalBlueprint,
    characterCanons,
    castPresent: imageBlueprint.cast_present || [],
    scenePrompt: imageBlueprint.image_prompt,
    visualState: imageBlueprint.visual_state || {},
    continuityImageStorageKey: continuityStorageKey(project),
    pairedText,
    structuredSceneContract: imageBlueprint.scene_contract || null,
    adjacentReferenceImages,
  });
  const wardrobeAuthorityReferences = wardrobeVisualReferencesFromCheckpoint(
    continuity.sceneFidelityContract?.scene_render_contract,
    generationCheckpoint(project)?.wardrobeVisualAuthority,
  );
  if (wardrobeAuthorityReferences.length) {
    continuity = buildSceneContinuity({
      blueprint: project.finalBlueprint,
      characterCanons,
      castPresent: imageBlueprint.cast_present || [],
      scenePrompt: imageBlueprint.image_prompt,
      visualState: imageBlueprint.visual_state || {},
      continuityImageStorageKey: continuityStorageKey(project),
      pairedText,
      structuredSceneContract: imageBlueprint.scene_contract || null,
      adjacentReferenceImages,
      wardrobeAuthorityReferences,
    });
  }
  const style = findIllustrationStyle(project.questionnaire?.style_id || project.productConfiguration?.style_id);
  const basePrompt = sceneContractImagePrompt({
    contract: imageBlueprint.scene_contract,
    stylePrompt: project.finalBlueprint.style?.style_prompt || project.finalBlueprint.style?.prompt || "",
    fallbackPrompt: imageBlueprint.image_prompt,
    visualAliases: continuity.visualAliases,
  });
  const localRequest = [
    "CUSTOMER-REQUESTED LOCAL VISUAL ADJUSTMENT:",
    instruction,
    "Apply this request only when it does not change the approved plot, physical cast, location, object state or main action.",
    "The authoritative scene contract and character continuity remain higher priority.",
    "Edit the preserved source locally. Preserve exactly one complete visible instance of every required named person or animal. Remove an accidental duplicate in place; never solve a cast problem by adding another subject or regenerating the whole scene.",
  ].join("\n");
  const imageUrl = await generateQualityCheckedImage({
    prompt: `${basePrompt}\n\n${localRequest}`,
    safetyFallbackPrompt: `${sceneContractImagePrompt({
      contract: imageBlueprint.scene_contract,
      stylePrompt: project.finalBlueprint.style?.style_prompt || project.finalBlueprint.style?.prompt || "",
      fallbackPrompt: imageBlueprint.image_prompt,
      visualAliases: continuity.visualAliases,
      safetyFallback: true,
    })}\n\n${localRequest}`,
    outName: `modification-${modificationId}-page-${spread.imagePageNumber}`,
    castPresent: imageBlueprint.cast_present || [],
    pageLabel: `customer modification for preview page ${spread.imagePageNumber}`,
    ...continuity,
    referenceImages: [
      ...(currentPage?.imageStorageKey ? [{
        kind: "repair_source",
        storageKey: currentPage.imageStorageKey,
        label: "current accepted page; preserve its identity likeness, composition and every unaffected detail while applying only the requested local change",
      }] : []),
      ...(continuity.referenceImages || []),
    ],
    size: "1024x1024",
    quality: "low",
    renderingMode: style.renderingMode,
    likenessGoal: style.likeness,
    model: process.env.DRAFT_IMAGE_MODEL || "gpt-image-2",
    maximumAttempts: 2,
    onAttempt,
    verifyExactCast: true,
    revisionInstruction: instruction,
  });
  const persisted = await persistPreviewAsset({ projectId: project.id, assetUrl: imageUrl });
  return { imageUrl, persisted };
}

async function buildCandidate(modification, jobId) {
  const project = await projectStore.get(modification.projectId);
  if (!project || fingerprint(project) !== modification.sourceFingerprint) {
    throw new Error("The source preview changed before this modification could be generated");
  }
  const spread = selectedSpread(project, modification.spreadNumber);
  if (!spread) throw new Error("The selected spread is unavailable");
  const draftPages = project.previewResult.draftPages.map((page) => ({ ...page }));
  const textIndex = draftPages.findIndex((page) => Number(page.page_number) === spread.textPageNumber);
  const imageIndex = draftPages.findIndex((page) => Number(page.page_number) === spread.imagePageNumber);
  let pairedText = draftPages[textIndex].text;

  if (["text", "both"].includes(modification.changeScope)) {
    updateJob(jobId, { step: `modification:spread:${spread.spreadNumber}:text` });
    const blueprintPage = project.finalBlueprint.pages.find((page) => (
      Number(page.page_number) === spread.imagePageNumber
    ));
    pairedText = await rewriteApprovedSpreadText({
      project,
      blueprintPage,
      currentText: spread.currentText,
      instruction: modification.instruction,
      requestId: modification.id,
    });
    const outputSafety = await guardChildSafety({
      text: pairedText,
      childAge: Number(project.questionnaire?.age),
      locale: project.locale,
      scope: "preview_modification_output",
    }, {
      onTrace: (trace) => console.info("child-safety assessed", trace),
      onError: (error) => console.warn("child-safety deterministic fallback", {
        scope: "preview_modification_output",
        error: String(error?.message || error),
      }),
    });
    if (outputSafety.intervention) {
      const error = new Error("The proposed text did not pass child-safety review");
      error.code = outputSafety.intervention.code;
      throw error;
    }
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const composedTextUrl = await composeBookPagePNG({
      baseUrl,
      body: pairedText,
      outName: `modification-${modification.id}-page-${spread.textPageNumber}`,
      pageType: draftPages[textIndex].page_type || "text",
      pageNumber: spread.textPageNumber,
      fontStyle: project.finalBlueprint.typography?.id,
      readerAge: project.finalBlueprint.hero?.age,
      dpi: 150,
    });
    const persistedText = await persistPreviewAsset({ projectId: project.id, assetUrl: composedTextUrl });
    draftPages[textIndex] = {
      ...draftPages[textIndex],
      text: pairedText,
      previewUrl: persistedText.previewUrl,
      storageKey: persistedText.storageKey,
      modifiedAt: new Date().toISOString(),
      modificationId: modification.id,
    };
  }

  if (["illustration", "both"].includes(modification.changeScope)) {
    updateJob(jobId, { step: `modification:spread:${spread.spreadNumber}:illustration` });
    const generatedImage = await regenerateSpreadIllustration({
      project,
      spread,
      pairedText,
      instruction: modification.instruction,
      modificationId: modification.id,
      onAttempt: ({ phase, attempt, maximumAttempts, issues, error }) => {
        updateJob(jobId, {
          step: `modification:spread:${spread.spreadNumber}:illustration:${attempt}/${maximumAttempts}:${phase}`,
          ...(issues?.length ? { issues } : {}),
          ...(error ? { attemptError: error } : {}),
        });
      },
    });
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const composedImageUrl = await composeBookPagePNG({
      baseUrl,
      imageUrl: generatedImage.imageUrl,
      outName: `modification-${modification.id}-page-${spread.imagePageNumber}-layout`,
      pageType: "image",
      pageNumber: spread.imagePageNumber,
      fontStyle: project.finalBlueprint.typography?.id,
      readerAge: project.finalBlueprint.hero?.age,
      dpi: 150,
    });
    const persistedPage = await persistPreviewAsset({ projectId: project.id, assetUrl: composedImageUrl });
    draftPages[imageIndex] = {
      ...draftPages[imageIndex],
      imageUrl: generatedImage.persisted.previewUrl,
      imageStorageKey: generatedImage.persisted.storageKey,
      previewUrl: persistedPage.previewUrl,
      storageKey: persistedPage.storageKey,
      modifiedAt: new Date().toISOString(),
      modificationId: modification.id,
    };
  }

  return {
    finalBlueprint: project.finalBlueprint,
    previewResult: { ...project.previewResult, draftPages },
  };
}

function startGeneration(modification, reservation) {
  const job = createJob({
    status: "running",
    kind: "preview_modification",
    projectId: modification.projectId,
    modificationId: modification.id,
    step: `modification:spread:${modification.spreadNumber}:preparing`,
  });
  runningModifications.add(modification.id);
  withOpenAICostContext({
    projectId: modification.projectId,
    runId: job.id,
    workflow: "preview_modification",
    attemptKind: "customer_change",
    stage: `modification:spread:${modification.spreadNumber}:generating`,
  }, async () => {
    try {
      await previewRevisionStore.update(modification.id, {
        status: "generating",
        reservationId: reservation.id,
        attemptCount: Number(modification.attemptCount || 0) + 1,
        failureCode: "",
        failureMessage: "",
      });
      const candidateSnapshot = await buildCandidate(modification, job.id);
      const latestProject = await projectStore.get(modification.projectId);
      if (!latestProject || latestProject.status !== "preview_ready" || fingerprint(latestProject) !== modification.sourceFingerprint) {
        throw new Error("The source preview changed or entered checkout during generation");
      }
      await creditStore.capturePreview(reservation.id);
      const updated = await previewRevisionStore.update(modification.id, {
        status: "awaiting_approval",
        candidateSnapshot,
      });
      updateJob(job.id, {
        status: "done",
        step: `modification:spread:${modification.spreadNumber}:awaiting-approval`,
        result: {
          modificationId: modification.id,
          spreadNumber: modification.spreadNumber,
          status: updated.status,
        },
      });
    } catch (error) {
      await creditStore.releasePreview(reservation.id).catch(() => null);
      await previewRevisionStore.update(modification.id, {
        status: "failed",
        failureCode: failureCode(error),
        failureMessage: String(error?.message || error),
      }).catch(() => null);
      updateJob(job.id, {
        status: "failed",
        step: `modification:spread:${modification.spreadNumber}:failed`,
        error: "La génération de cette proposition n’a pas abouti.",
        errorCode: failureCode(error),
      });
      console.error("[preview-modification] failed", JSON.stringify({
        jobId: job.id,
        projectId: modification.projectId,
        modificationId: modification.id,
        errorCode: failureCode(error),
        error: String(error?.message || error),
      }));
    } finally {
      runningModifications.delete(modification.id);
    }
  });
  return job;
}

router.get("/projects/:id/preview-modifications/quote", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  try {
    const project = await projectStore.getForCustomer(req.params.id, identity);
    const invalid = validateReadyProject(project);
    if (invalid) return res.status(invalid.status).json({ error: invalid.error });
    if (await creditStore.hasActiveCheckoutReservation(identity, { projectId: project.id })) {
      return res.status(409).json({ error: "Finish or leave the active checkout before requesting a modification" });
    }
    const scope = String(req.query.scope || "illustration");
    const spread = selectedSpread(project, req.query.spreadNumber);
    if (!spread) return res.status(400).json({ error: "Select an available spread" });
    const amountCents = previewModificationPriceCents(scope);
    const summary = await creditStore.summary(identity, project.id);
    res.set("Cache-Control", "private, no-store");
    res.json({
      spread,
      scope,
      amountCents,
      balanceCents: summary.balanceCents,
      missingCents: Math.max(0, amountCents - summary.balanceCents),
      buyCreditsUrl: process.env.WOOCOMMERCE_CREDITS_URL || "",
      availableSpreads: eligibleSpreads(project),
    });
  } catch (error) {
    res.status(400).json({ error: String(error?.message || error) });
  }
});

router.get("/projects/:id/preview-modifications/latest", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  const project = await projectStore.getForCustomer(req.params.id, identity);
  if (!project) return res.status(404).json({ error: "Project not found" });
  let modification = await previewRevisionStore.latestForProject(identity, project.id);
  const staleMinutes = Math.max(5, Number.parseInt(process.env.PREVIEW_MODIFICATION_STALE_MINUTES || "15", 10) || 15);
  const stale = modification
    && ["reserved", "generating"].includes(modification.status)
    && !runningModifications.has(modification.id)
    && Date.parse(modification.updatedAt || 0) <= Date.now() - (staleMinutes * 60000);
  if (stale) {
    if (modification.reservationId) await creditStore.releasePreview(modification.reservationId).catch(() => null);
    modification = await previewRevisionStore.update(modification.id, {
      status: "failed",
      failureCode: "infrastructure_interrupted",
      failureMessage: "The background modification job was interrupted",
    });
  }
  res.set("Cache-Control", "private, no-store");
  res.json({
    modification: modificationView(modification, {
      includeCandidate: modification?.status === "awaiting_approval",
    }),
  });
});

router.post("/projects/:id/preview-modifications", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  try {
    const project = await projectStore.getForCustomer(req.params.id, identity);
    const invalid = validateReadyProject(project);
    if (invalid) return res.status(invalid.status).json({ error: invalid.error });
    if (await creditStore.hasActiveCheckoutReservation(identity, { projectId: project.id })) {
      return res.status(409).json({ error: "Finish or leave the active checkout before requesting a modification" });
    }
    const spread = selectedSpread(project, req.body?.spreadNumber);
    if (!spread) return res.status(400).json({ error: "Select an available spread" });
    const changeScope = String(req.body?.scope || "");
    const amountCents = previewModificationPriceCents(changeScope);
    const instruction = String(req.body?.instruction || "").replace(/\s+/g, " ").trim();
    if (instruction.length < 8 || instruction.length > 800) {
      return res.status(400).json({ error: "Describe the requested local change in 8 to 800 characters" });
    }
    const safety = await guardChildSafety({
      text: instruction,
      childAge: Number(project.questionnaire?.age),
      locale: project.locale,
      scope: "preview_modification",
    }, {
      onTrace: (trace) => console.info("child-safety assessed", trace),
      onError: (error) => console.warn("child-safety deterministic fallback", {
        scope: "preview_modification",
        error: String(error?.message || error),
      }),
    });
    if (safety.intervention) {
      return res.status(safety.intervention.status).json(childSafetyResponse(safety.intervention, project.locale));
    }
    const policy = inspectPreviewModificationRequest({
      project,
      spreadNumber: spread.spreadNumber,
      instruction,
    });
    if (!policy.allowed) {
      return res.status(422).json({
        error: "This local change introduces a character outside the approved scene",
        ...policy,
      });
    }
    const created = await previewRevisionStore.create(identity, {
      projectId: project.id,
      spreadNumber: spread.spreadNumber,
      changeScope,
      instruction,
      amountCents,
      sourceFingerprint: fingerprint(project),
      sourceSnapshot: { finalBlueprint: project.finalBlueprint, previewResult: project.previewResult },
    });
    if (!created.created) {
      return res.status(409).json({
        error: "Another modification is already active",
        modification: modificationView(created.modification, {
          includeCandidate: created.modification.status === "awaiting_approval",
        }),
      });
    }
    let reservation;
    try {
      reservation = await creditStore.reservePreview(identity, {
        projectId: project.id,
        amountCents,
        idempotencyKey: `preview-modification:${created.modification.id}`,
      });
    } catch (error) {
      if (error instanceof InsufficientCreditError) {
        await previewRevisionStore.update(created.modification.id, { status: "quoted" }).catch(() => null);
        return res.status(402).json({
          error: "Insufficient preview credit",
          code: "insufficient_credit",
          requiredCents: error.requiredCents,
          balanceCents: error.balanceCents,
          missingCents: error.missingCents,
          buyCreditsUrl: process.env.WOOCOMMERCE_CREDITS_URL || "",
        });
      }
      await previewRevisionStore.update(created.modification.id, {
        status: "failed",
        failureCode: "reservation_failed",
        failureMessage: String(error?.message || error),
      }).catch(() => null);
      throw error;
    }
    const reserved = await previewRevisionStore.update(created.modification.id, {
      status: "reserved",
      reservationId: reservation.id,
    });
    const job = startGeneration(reserved, reservation);
    res.status(202).json({
      jobId: job.id,
      modification: modificationView(reserved),
    });
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.post("/projects/:id/preview-modifications/:modificationId/retry", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  try {
    const project = await projectStore.getForCustomer(req.params.id, identity);
    const invalid = validateReadyProject(project);
    if (invalid) return res.status(invalid.status).json({ error: invalid.error });
    const modification = await previewRevisionStore.getForCustomer(req.params.modificationId, identity);
    if (!modification || modification.projectId !== project.id) return res.status(404).json({ error: "Modification not found" });
    if (modification.status !== "failed" || runningModifications.has(modification.id)) {
      return res.status(409).json({ error: "This modification is not retryable" });
    }
    if (fingerprint(project) !== modification.sourceFingerprint) {
      return res.status(409).json({ error: "The source preview has changed" });
    }
    const safety = await guardChildSafety({
      text: modification.instruction,
      childAge: Number(project.questionnaire?.age),
      locale: project.locale,
      scope: "preview_modification_retry",
    }, {
      onTrace: (trace) => console.info("child-safety assessed", trace),
      onError: (error) => console.warn("child-safety deterministic fallback", {
        scope: "preview_modification_retry",
        error: String(error?.message || error),
      }),
    });
    if (safety.intervention) {
      await previewRevisionStore.update(modification.id, {
        status: "rejected",
        rejectedAt: new Date().toISOString(),
        failureCode: safety.intervention.code,
        failureMessage: "The request did not pass child-safety review",
      });
      return res.status(safety.intervention.status).json(childSafetyResponse(safety.intervention, project.locale));
    }
    const policy = inspectPreviewModificationRequest({
      project,
      spreadNumber: modification.spreadNumber,
      instruction: modification.instruction,
    });
    if (!policy.allowed) {
      await previewRevisionStore.update(modification.id, {
        status: "rejected",
        rejectedAt: new Date().toISOString(),
        failureCode: policy.code,
        failureMessage: "The request changes the approved character cast",
      });
      return res.status(422).json({
        error: "This local change introduces a character outside the approved scene",
        ...policy,
      });
    }
    const reservation = await creditStore.reservePreview(identity, {
      projectId: project.id,
      amountCents: modification.amountCents,
      idempotencyKey: `preview-modification:${modification.id}`,
    });
    const reserved = await previewRevisionStore.update(modification.id, {
      status: "reserved",
      reservationId: reservation.id,
    });
    const job = startGeneration(reserved, reservation);
    res.status(202).json({ jobId: job.id, modification: modificationView(reserved) });
  } catch (error) {
    res.status(error instanceof InsufficientCreditError ? 402 : 500).json({ error: String(error?.message || error) });
  }
});

router.post("/projects/:id/preview-modifications/:modificationId/approve", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  try {
    const project = await projectStore.getForCustomer(req.params.id, identity);
    const invalid = validateReadyProject(project);
    if (invalid) return res.status(invalid.status).json({ error: invalid.error });
    const modification = await previewRevisionStore.getForCustomer(req.params.modificationId, identity);
    if (!modification || modification.projectId !== project.id) return res.status(404).json({ error: "Modification not found" });
    if (modification.status !== "awaiting_approval" || !modification.candidateSnapshot) {
      return res.status(409).json({ error: "No generated modification is awaiting approval" });
    }
    if (fingerprint(project) !== modification.sourceFingerprint) {
      return res.status(409).json({ error: "The source preview has changed" });
    }
    const candidate = modification.candidateSnapshot;
    const updatedProject = await projectStore.updateForCustomer(project.id, identity, {
      finalBlueprint: candidate.finalBlueprint,
      previewResult: candidate.previewResult,
    });
    try {
      await previewRevisionStore.approve(modification.id, candidate);
    } catch (error) {
      await projectStore.updateForCustomer(project.id, identity, {
        finalBlueprint: project.finalBlueprint,
        previewResult: project.previewResult,
      }).catch(() => null);
      throw error;
    }
    res.json({ applied: Boolean(updatedProject), modification: { ...modificationView(modification), status: "approved" } });
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.post("/projects/:id/preview-modifications/:modificationId/reject", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  const project = await projectStore.getForCustomer(req.params.id, identity);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const modification = await previewRevisionStore.getForCustomer(req.params.modificationId, identity);
  if (!modification || modification.projectId !== project.id) return res.status(404).json({ error: "Modification not found" });
  if (modification.status !== "awaiting_approval") return res.status(409).json({ error: "This modification cannot be rejected" });
  const rejected = await previewRevisionStore.update(modification.id, {
    status: "rejected",
    rejectedAt: new Date().toISOString(),
    candidateSnapshot: null,
  });
  res.json({ modification: modificationView(rejected) });
});

export { eligibleSpreads, fingerprint };
export default router;
