import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { getWordsTargetByAge } from "../src/config/readingGuidance.js";
import { compileNarrativeBookSpecV3 } from "../src/contracts/narrativeBookSpecV3.js";
import { compileObjectLifecycleProjection } from "../src/contracts/objectLifecycleProjection.js";
import { buildNarrativeV3ObjectFixture } from "../src/services/narrativeV3ObjectLifecycleMatrix.js";
import {
  approvedChildSafetyAuthority,
  assessSealedGeneratedSafetyDrift,
  GENERATED_MANUSCRIPT_SAFETY_CONFORMANCE_VERSION,
  normalizeGeneratedManuscriptSafety,
  sealedChildSafetyDecision,
} from "../src/services/generatedManuscriptSafetyConformance.js";

function fixture() {
  const source = buildNarrativeV3ObjectFixture({ language: "FR", universeId: "coral_ocean" });
  const objectProjection = compileObjectLifecycleProjection({ graph: source.graph });
  const spec = compileNarrativeBookSpecV3({
    intent: source.intent,
    graph: source.graph,
    objectProjection,
    profileBindings: source.profileBindings,
  });
  const childSafety = {
    profileVersion: 1,
    category: "general",
    action: "allow",
    restricted: false,
  };
  const project = {
    questionnaire: {
      child_safety_profile: { version: 1, category: "general", action: "allow", restricted: false },
      story_sensitivity_profile: { version: 2, level: 1, category: "everyday_challenge", restricted: false },
    },
    continuitySnapshot: {
      narrativeV3Approval: { artifactDigest: spec.validation.artifactDigest, childSafety },
    },
  };
  return { spec, project, authority: approvedChildSafetyAuthority({ project, spec }) };
}

function validTexts(spec, dangerPage = null, namedCharacter = "") {
  return Object.fromEntries(spec.pages
    .filter((page) => ["opening_text", "scene_text", "closing_text"].includes(page.kind))
    .map((page) => {
      const guidance = getWordsTargetByAge(spec.book.audienceAge, page.kind === "scene_text" ? "text" : page.kind);
      const words = Array(guidance.target).fill("aventure");
      if (page.pageNumber === dangerPage) {
        words[0] = "danger";
        if (namedCharacter) words[1] = namedCharacter;
      }
      return [page.pageNumber, words.join(" ")];
    }));
}

test("approved scenario safety is reused as the final customer-facing authority", () => {
  const { authority } = fixture();
  const decision = sealedChildSafetyDecision(authority);
  assert.equal(decision.profile.action, "allow");
  assert.equal(decision.profile.source, "approved_scenario");
  assert.equal(decision.intervention, null);
});

test("safe generated prose passes without repair", async () => {
  const { spec, authority } = fixture();
  let repairs = 0;
  const result = await normalizeGeneratedManuscriptSafety({
    spec,
    authority,
    pageTexts: validTexts(spec),
    assess: async () => ({ profile: { action: "allow", category: "general" } }),
    repair: async () => { repairs += 1; return { pages: [] }; },
  });
  assert.equal(result.version, GENERATED_MANUSCRIPT_SAFETY_CONFORMANCE_VERSION);
  assert.equal(result.status, "valid");
  assert.equal(result.changed, false);
  assert.equal(repairs, 0);
});

test("approved fiction cannot be reclassified as a customer disclosure after scenario approval", async () => {
  const { spec, authority } = fixture();
  const texts = validTexts(spec);
  const firstPage = spec.pages.find((page) => ["opening_text", "scene_text"].includes(page.kind));
  texts[firstPage.pageNumber] = texts[firstPage.pageNumber].replace(
    "aventure",
    "Un adulte approche avec un secret, mais le héros rejoint aussitôt sa famille",
  );
  let repairs = 0;
  const result = await normalizeGeneratedManuscriptSafety({
    spec,
    authority,
    pageTexts: texts,
    repair: async () => { repairs += 1; return { pages: [] }; },
  });
  assert.equal(result.status, "valid");
  assert.equal(repairs, 0);
});

test("sealed deterministic conformance still detects explicit generated unsafe drift", () => {
  const { authority } = fixture();
  const assessment = assessSealedGeneratedSafetyDrift({
    authority,
    text: "Un adulte lui offre un cadeau pour garder le secret et ne rien dire à ses parents.",
  });
  assert.equal(assessment.profile.action, "block");
  assert.equal(assessment.profile.source, "sealed_deterministic_drift");
});

test("sealed deterministic conformance checks every page beyond aggregate text limits", async () => {
  const { spec, authority } = fixture();
  const texts = validTexts(spec);
  const lastPage = [...spec.pages].reverse().find((page) => (
    ["opening_text", "scene_text", "closing_text"].includes(page.kind)
  ));
  texts[lastPage.pageNumber] = texts[lastPage.pageNumber].replace(
    "aventure",
    "Un adulte lui offre un cadeau pour garder le secret et ne rien dire à ses parents",
  );
  await assert.rejects(
    normalizeGeneratedManuscriptSafety({ spec, authority, pageTexts: texts }),
    (error) => error.code === "generated_manuscript_safety_drift_unresolved"
      && error.pageNumber === lastPage.pageNumber,
  );
});

test("generated safety drift is localized and repaired privately once", async () => {
  const { spec, authority } = fixture();
  const page = spec.pages.find((candidate) => candidate.kind === "scene_text");
  const texts = validTexts(spec, page.pageNumber);
  const result = await normalizeGeneratedManuscriptSafety({
    spec,
    authority,
    pageTexts: texts,
    assess: async ({ text }) => ({
      profile: text.includes("danger")
        ? { action: "support", category: "possible_abuse_disclosure" }
        : { action: "allow", category: "general" },
    }),
    repair: async ({ pages }) => ({
      pages: pages.map((candidate) => ({
        page_number: candidate.page_number,
        text: candidate.current_text.replace("danger", "prudence"),
      })),
    }),
  });
  assert.equal(result.status, "normalized");
  assert.deepEqual(result.changedPageNumbers, [page.pageNumber]);
  assert.match(result.pageTexts[page.pageNumber], /^prudence /);
});

test("a private repair cannot alter approved named-character mentions", async () => {
  const { spec, authority } = fixture();
  const page = spec.pages.find((candidate) => candidate.kind === "scene_text");
  const scene = spec.scenes[page.sceneNumber - 1];
  const character = spec.registries.characters.find((candidate) => (
    scene.presences.some((presence) => presence.characterId === candidate.id)
  ));
  const texts = validTexts(spec, page.pageNumber, character.displayName);
  await assert.rejects(
    normalizeGeneratedManuscriptSafety({
      spec,
      authority,
      pageTexts: texts,
      assess: async ({ text }) => ({ profile: text.includes("danger")
        ? { action: "support", category: "possible_abuse_disclosure" }
        : { action: "allow", category: "general" } }),
      repair: async ({ pages }) => ({
        pages: pages.map((candidate) => ({
          page_number: candidate.page_number,
          text: candidate.current_text.replace("danger", "prudence").replace(character.displayName, "aventure"),
        })),
      }),
    }),
    (error) => error.code === "manuscript_safety_conformance_entity_drift",
  );
});

test("unresolved generated drift fails technically and never emits a customer support decision", async () => {
  const { spec, authority } = fixture();
  const page = spec.pages.find((candidate) => candidate.kind === "scene_text");
  const texts = validTexts(spec, page.pageNumber);
  await assert.rejects(
    normalizeGeneratedManuscriptSafety({
      spec,
      authority,
      pageTexts: texts,
      assess: async ({ text }) => ({ profile: text.includes("danger")
        ? { action: "block", category: "exploitative_normalization" }
        : { action: "allow", category: "general" } }),
      repair: async ({ pages }) => ({
        pages: pages.map((candidate) => ({ page_number: candidate.page_number, text: `${candidate.current_text} encore` })),
      }),
    }),
    (error) => error.code === "manuscript_safety_conformance_contract_drift"
      || error.code === "generated_manuscript_safety_drift_unresolved",
  );
});

test("production orders safety conformance before storyboard binding and text authority", () => {
  const source = fs.readFileSync(new URL("../src/routes/preview.js", import.meta.url), "utf8");
  const conformance = source.indexOf("normalizeGeneratedManuscriptSafety({");
  const binding = source.indexOf("storyboardBindingIssues(");
  const authority = source.indexOf("prepareNarrativeV3ProductionTextAuthority({");
  assert.ok(conformance > 0);
  assert.ok(binding > conformance);
  assert.ok(authority > binding);
  assert.match(source, /reused approved narrative authority/);
  assert.doesNotMatch(source, /scope:\s*pageNumber\s*\?\s*`generated_manuscript_conformance_page_/);
});
