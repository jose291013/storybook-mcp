import express from "express";
import { storyScenarioAgent } from "../agents/storyScenario.js";
import { createPagePlan } from "../config/bookStructure.js";
import { readWooCustomer } from "../services/draftIdentity.js";
import { normalizeBookRequest } from "../services/normalizeBookRequest.js";
import { previewRequestFingerprint } from "../services/previewGenerationCheckpoint.js";
import { projectStore } from "../services/projectStore.js";
import {
  applyCreatorStoryScenarioEdits,
  normalizeStoryScenario,
  scenarioCharacterRegistry,
  stabilizeStoryScenario,
  summarizeStoryScenarioValidation,
  storyScenarioSnapshot,
  validateStoryScenario,
} from "../services/storyScenario.js";

const router = express.Router();
const EDITABLE_STATUSES = new Set(["ready_for_preview", "scenario_review", "scenario_needs_clarification"]);
const activeScenarioUpdates = new Set();

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

function safeAnswers(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 5).map(([id, answer]) => [String(id).slice(0, 80), String(answer || "").slice(0, 800)]));
}

function safeSceneEdits(value) {
  return (Array.isArray(value) ? value : []).slice(0, 24).map((edit) => ({
    scene_number: Number(edit?.scene_number || 0),
    ...(Object.hasOwn(edit || {}, "title") ? { title: String(edit?.title || "").slice(0, 160) } : {}),
    ...(Object.hasOwn(edit || {}, "location") ? { location: String(edit?.location || "").slice(0, 240) } : {}),
    ...(Object.hasOwn(edit || {}, "action") ? { action: String(edit?.action || "").slice(0, 1200) } : {}),
    ...(Array.isArray(edit?.character_presences) ? { character_presences: edit.character_presences.slice(0, 30).map((presence) => ({
      name: String(presence?.name || "").slice(0, 120),
      mode: ["physical", "thought", "memory", "voice", "absent"].includes(presence?.mode) ? presence.mode : "absent",
    })).filter((presence) => presence.name) } : {}),
  })).filter((edit) => Number.isInteger(edit.scene_number) && edit.scene_number > 0);
}

function safeAddedCharacters(value) {
  return (Array.isArray(value) ? value : []).slice(0, 10).map((character) => ({
    name: String(character?.name || character || "").trim().slice(0, 120),
  })).filter((character) => character.name);
}

async function generateValidatedScenario({ normalized, previousScenario, creatorClarifications, sceneEdits, addedCharacters, feedback }) {
  const pagePlan = createPagePlan(normalized.answers.page_count);
  const canonicalCharacters = [...scenarioCharacterRegistry(normalized), ...(previousScenario?.characters || []), ...addedCharacters.map((character) => ({
    name: character.name, role: "story_character", storyRole: "guest", relationship: "story character",
  }))].filter((character, index, all) => character.name && all.findIndex((candidate) => candidate.name.localeCompare(character.name, undefined, { sensitivity: "base" }) === 0) === index);
  const input = {
    intake: normalized.answers,
    canonical_characters: canonicalCharacters,
    page_plan: pagePlan.filter((page) => page.page_type === "image"),
    creator_clarifications: creatorClarifications,
    creator_scene_edits: sceneEdits,
    creator_feedback: String(feedback || "").slice(0, 2000),
    previous_scenario: previousScenario || null,
  };
  let candidate = await storyScenarioAgent(input);
  let scenario = stabilizeStoryScenario(applyCreatorStoryScenarioEdits(
    normalizeStoryScenario(candidate, { pagePlan, canonicalCharacters, creatorClarifications }),
    { sceneEdits, addedCharacters },
  ));
  let validation = validateStoryScenario(scenario);
  if (!validation.valid) {
    candidate = await storyScenarioAgent({ ...input, previous_scenario: scenario, validation_issues: validation.issues });
    scenario = stabilizeStoryScenario(applyCreatorStoryScenarioEdits(
      normalizeStoryScenario(candidate, { pagePlan, canonicalCharacters, creatorClarifications }),
      { sceneEdits, addedCharacters },
    ));
    validation = validateStoryScenario(scenario);
  }
  return { scenario, validation };
}

router.post("/projects/:id/story-scenario", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  try {
    const project = await projectStore.getForCustomer(req.params.id, identity);
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (!EDITABLE_STATUSES.has(project.status)) {
      return res.status(409).json({ error: "This project can no longer replace its scenario", code: "scenario_locked" });
    }
    const normalized = normalizeBookRequest({ questionnaire: project.questionnaire, photos: project.photoRefs });
    const fingerprint = previewRequestFingerprint(normalized);
    const previous = storyScenarioSnapshot(project);
    const creatorClarifications = { ...(previous?.creatorClarifications || {}), ...safeAnswers(req.body?.clarifications) };
    const sceneEdits = safeSceneEdits(req.body?.sceneEdits);
    const addedCharacters = safeAddedCharacters(req.body?.addedCharacters);
    if (activeScenarioUpdates.has(project.id)) {
      return res.status(409).json({ error: "Scenario update already in progress", code: "scenario_update_in_progress", retryable: true });
    }
    activeScenarioUpdates.add(project.id);
    try {
      const { scenario, validation } = await generateValidatedScenario({
        normalized,
        previousScenario: previous?.fingerprint === fingerprint ? previous : null,
        creatorClarifications,
        sceneEdits,
        addedCharacters,
        feedback: req.body?.feedback,
      });
      if (!validation.valid) {
        console.warn("[story-scenario] validation failed", { projectId: project.id, issueCount: validation.issues.length });
        const createdAt = new Date().toISOString();
        const validationSummary = summarizeStoryScenarioValidation(validation);
        const storedScenario = {
          ...scenario,
          fingerprint,
          status: "needs_revision",
          revision: Number(previous?.revision || 0) + 1,
          validation: validationSummary,
          createdAt,
          approvedAt: null,
        };
        const continuitySnapshot = {
          ...project.continuitySnapshot,
          storyScenarioWorkflow: { required: true, version: 1, startedAt: previous?.createdAt || createdAt },
          storyScenario: storedScenario,
        };
        await projectStore.updateForCustomer(project.id, identity, { status: "scenario_review", continuitySnapshot, generationJobId: null });
        return res.status(422).json({
          error: "The provisional scenario needs another update",
          code: "scenario_invalid",
          retryable: true,
          scenario: storedScenario,
          status: "scenario_review",
          diagnostics: validationSummary,
        });
      }
      const createdAt = new Date().toISOString();
      const storedScenario = {
        ...scenario,
        fingerprint,
        status: scenario.clarifications.length ? "needs_clarification" : "proposed",
        revision: Number(previous?.revision || 0) + 1,
        validation,
        createdAt,
        approvedAt: null,
      };
      const continuitySnapshot = {
        ...project.continuitySnapshot,
        storyScenarioWorkflow: { required: true, version: 1, startedAt: previous?.createdAt || createdAt },
        storyScenario: storedScenario,
      };
      const status = storedScenario.status === "needs_clarification" ? "scenario_needs_clarification" : "scenario_review";
      await projectStore.updateForCustomer(project.id, identity, { status, continuitySnapshot, generationJobId: null });
      res.set("Cache-Control", "private, no-store");
      res.json({ scenario: storedScenario, status });
    } finally {
      activeScenarioUpdates.delete(project.id);
    }
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error) });
  }
});

router.post("/projects/:id/story-scenario/approve", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  try {
    const project = await projectStore.getForCustomer(req.params.id, identity);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const normalized = normalizeBookRequest({ questionnaire: project.questionnaire, photos: project.photoRefs });
    const fingerprint = previewRequestFingerprint(normalized);
    const scenario = storyScenarioSnapshot(project);
    if (!scenario || scenario.fingerprint !== fingerprint) {
      return res.status(409).json({ error: "The scenario no longer matches this project", code: "scenario_stale" });
    }
    const validation = validateStoryScenario(scenario);
    if (!validation.valid) {
      console.warn("[story-scenario] approval validation failed", { projectId: project.id, issueCount: validation.issues.length });
      return res.status(422).json({ error: "The scenario needs another update before approval", code: "scenario_invalid", retryable: true });
    }
    if (scenario.clarifications?.length) {
      return res.status(409).json({ error: "Answer the scenario questions before approval", code: "scenario_clarification_required" });
    }
    const approved = { ...scenario, status: "approved", validation, approvedAt: new Date().toISOString() };
    const continuitySnapshot = { ...project.continuitySnapshot, storyScenario: approved };
    await projectStore.updateForCustomer(project.id, identity, { status: "ready_for_preview", continuitySnapshot });
    res.set("Cache-Control", "private, no-store");
    res.json({ scenario: approved, status: "ready_for_preview" });
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error) });
  }
});

export default router;
