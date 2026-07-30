import test from "node:test";
import assert from "node:assert/strict";
import { generationCostPolicy } from "../src/services/generationCostPolicy.js";
import {
  applyManuscriptCorrections,
  manuscriptBatches,
  mergeManuscriptBatch,
} from "../src/services/manuscriptBatches.js";
import { inferAttemptKind } from "../src/services/openaiCostContext.js";

test("the internal cost governor defaults to one premium narrative pass and three manuscript batches", () => {
  const policy = generationCostPolicy();
  assert.equal(policy.previewTargetUsd, 2);
  assert.equal(policy.previewStretchTargetUsd, 1.5);
  assert.deepEqual(policy.scenario, {
    architectCalls: 1,
    editorCalls: 1,
    repairCalls: 1,
    finalAuditCalls: 1,
  });
  assert.equal(policy.manuscript.maximumBatches, 3);
  assert.equal(policy.storyPlan.plannerCalls, 1);
  assert.equal(policy.storyPlan.repairCalls, 1);
});

test("manuscript pages are grouped into three acts and merged atomically", () => {
  const pages = [
    { page_number: 1, page_type: "opening_text", story_role: "opening" },
    { page_number: 3, page_type: "text", scene_number: 1, story_role: "scene" },
    { page_number: 5, page_type: "text", scene_number: 2, story_role: "scene" },
    { page_number: 7, page_type: "text", scene_number: 3, story_role: "scene" },
    { page_number: 9, page_type: "text", scene_number: 4, story_role: "scene" },
    { page_number: 24, page_type: "closing_text", story_role: "closing" },
  ];
  const approvedScenario = {
    scenes: [
      { sceneNumber: 1, act: 1 },
      { sceneNumber: 2, act: 1 },
      { sceneNumber: 3, act: 2 },
      { sceneNumber: 4, act: 3 },
    ],
  };
  const batches = manuscriptBatches({ pages, approvedScenario, heroAge: 8 });
  assert.deepEqual(batches.map((batch) => batch.act), [1, 2, 3]);
  assert.deepEqual(batches[0].pages.map((page) => page.page_number), [1, 3, 5]);
  assert.deepEqual(batches[2].pages.map((page) => page.page_number), [9, 24]);

  const texts = new Map();
  mergeManuscriptBatch(texts, {
    pages: [
      { page_number: 1, text: "Ouverture." },
      { page_number: 3, text: "Première scène." },
      { page_number: 5, text: "Deuxième scène." },
    ],
  }, batches[0].pages);
  assert.equal(texts.get(5), "Deuxième scène.");
  assert.throws(() => mergeManuscriptBatch(new Map(), {
    pages: [{ page_number: 1, text: "Ouverture." }],
  }, batches[0].pages), /missing page 3/i);
});

test("language review can only replace known manuscript pages", () => {
  const texts = new Map([[3, "Marie aide Bastien."]]);
  applyManuscriptCorrections(texts, {
    pages: [
      { page_number: 3, text: "Maman aide Bastien." },
      { page_number: 99, text: "Intrusion." },
    ],
  }, [3]);
  assert.equal(texts.get(3), "Maman aide Bastien.");
  assert.equal(texts.has(99), false);

  applyManuscriptCorrections(texts, {
    pages: [{ page_number: 3, text: "Maman aide Bastien avec Alexandra." }],
  }, [3], [{ name: "Alexandra" }]);
  assert.equal(texts.get(3), "Maman aide Bastien.");
});

test("targeted rechecks and repairs are attributed as quality rework", () => {
  assert.equal(inferAttemptKind("story:scenario-fidelity-targeted-recheck"), "quality_repair");
  assert.equal(inferAttemptKind("scenario:repair:attempt:1"), "quality_repair");
  assert.equal(inferAttemptKind("draft:page:7:attempt:2"), "technical_retry");
});
