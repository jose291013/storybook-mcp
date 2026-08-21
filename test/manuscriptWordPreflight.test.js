import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { getWordsTargetByAge } from "../src/config/readingGuidance.js";
import { compileNarrativeBookSpecV3 } from "../src/contracts/narrativeBookSpecV3.js";
import { compileObjectLifecycleProjection } from "../src/contracts/objectLifecycleProjection.js";
import { buildNarrativeV3ObjectFixture } from "../src/services/narrativeV3ObjectLifecycleMatrix.js";
import {
  MANUSCRIPT_WORD_PREFLIGHT_VERSION,
  manuscriptWordRepairRequestPages,
  manuscriptWordTargetIssues,
  normalizeManuscriptWordTargets,
} from "../src/services/manuscriptWordPreflight.js";

function fixture() {
  const source = buildNarrativeV3ObjectFixture({ language: "FR", universeId: "coral_ocean" });
  const objectProjection = compileObjectLifecycleProjection({ graph: source.graph });
  const spec = compileNarrativeBookSpecV3({
    intent: source.intent,
    graph: source.graph,
    objectProjection,
    profileBindings: source.profileBindings,
  });
  return { spec };
}

function validTexts(spec) {
  return Object.fromEntries(spec.pages
    .filter((page) => ["opening_text", "scene_text", "closing_text"].includes(page.kind))
    .map((page) => {
      const guidance = getWordsTargetByAge(spec.book.audienceAge, page.kind === "scene_text" ? "text" : page.kind);
      return [page.pageNumber, Array(guidance.target).fill("aventure").join(" ")];
    }));
}

test("V21 repairs only out-of-range physical pages before strict text authority", async () => {
  const { spec } = fixture();
  const texts = validTexts(spec);
  const pageNumber = spec.pages.find((page) => page.kind === "scene_text").pageNumber;
  texts[pageNumber] = "Nolan avance";
  const issues = manuscriptWordTargetIssues({ spec, pageTexts: texts });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].pageNumber, pageNumber);
  assert.match(issues[0].message, new RegExp(`Page ${pageNumber} has 2 words`));

  const result = await normalizeManuscriptWordTargets({
    spec,
    pageTexts: texts,
    canonicalNames: ["Nolan", "Mathéo"],
    repair: async ({ issues: requested }) => ({
      pages: requested.map((issue) => ({
        page_number: issue.pageNumber,
        text: ["Nolan", ...Array(issue.wordTarget - 1).fill("avance")].join(" "),
      })),
    }),
  });
  assert.equal(result.version, MANUSCRIPT_WORD_PREFLIGHT_VERSION);
  assert.equal(result.status, "normalized");
  assert.deepEqual(result.changedPageNumbers, [pageNumber]);
  assert.equal(result.repairs[0].beforeWords, 2);
  assert.equal(result.repairs[0].afterWords, result.repairs[0].wordTarget);
  assert.equal(manuscriptWordTargetIssues({ spec, pageTexts: result.pageTexts }).length, 0);
  const untouched = Number(Object.keys(texts).find((candidate) => Number(candidate) !== pageNumber));
  assert.equal(result.pageTexts[untouched], texts[untouched]);
});

test("V21 rejects a word-count correction that changes named-character mentions", async () => {
  const { spec } = fixture();
  const texts = validTexts(spec);
  const pageNumber = spec.pages.find((page) => page.kind === "scene_text").pageNumber;
  texts[pageNumber] = "Nolan avance";
  await assert.rejects(
    normalizeManuscriptWordTargets({
      spec,
      pageTexts: texts,
      canonicalNames: ["Nolan"],
      repair: async ({ issues }) => ({
        pages: issues.map((issue) => ({
          page_number: issue.pageNumber,
          text: Array(issue.wordTarget).fill("avance").join(" "),
        })),
      }),
    }),
    (error) => error.code === "manuscript_word_preflight_entity_drift"
      && error.pageNumber === pageNumber,
  );
});

test("V21 reports the physical page and exact range when bounded repair cannot converge", async () => {
  const { spec } = fixture();
  const texts = validTexts(spec);
  const pageNumber = spec.pages.find((page) => page.kind === "scene_text").pageNumber;
  texts[pageNumber] = "Nolan avance";
  await assert.rejects(
    normalizeManuscriptWordTargets({
      spec,
      pageTexts: texts,
      canonicalNames: ["Nolan"],
      repair: async () => ({ pages: [{ page_number: pageNumber, text: "Nolan avance encore" }] }),
    }),
    (error) => error.code === "manuscript_word_target_missed"
      && error.pageNumber === pageNumber
      && error.issues[0].minimumWords > error.issues[0].wordCount,
  );
});

test("V21 refuses duplicate or foreign correction pages", async () => {
  const { spec } = fixture();
  const texts = validTexts(spec);
  const pageNumber = spec.pages.find((page) => page.kind === "scene_text").pageNumber;
  texts[pageNumber] = "Nolan avance";
  await assert.rejects(
    normalizeManuscriptWordTargets({
      spec,
      pageTexts: texts,
      canonicalNames: ["Nolan"],
      repair: async ({ issues }) => {
        const text = ["Nolan", ...Array(issues[0].wordTarget - 1).fill("avance")].join(" ");
        return { pages: [{ page_number: pageNumber, text }, { page_number: pageNumber, text }] };
      },
    }),
    (error) => error.code === "manuscript_word_preflight_response_invalid",
  );
});

test("V21 repair input binds the current physical page to adjacent prose and its scene contract", () => {
  const { spec } = fixture();
  const texts = validTexts(spec);
  const scenePage = spec.pages.find((page) => page.kind === "scene_text");
  texts[scenePage.pageNumber] = "Nolan avance";
  const issues = manuscriptWordTargetIssues({ spec, pageTexts: texts });
  const storyScenePlan = {
    sceneContracts: [{
      text_page_number: scenePage.pageNumber,
      scene_number: scenePage.sceneNumber,
      visual_beat_digest: "a".repeat(64),
      main_action: { subject: "Nolan", action: "avance" },
    }],
  };
  const [request] = manuscriptWordRepairRequestPages({ spec, pageTexts: texts, issues, storyScenePlan });
  assert.equal(request.page_number, scenePage.pageNumber);
  assert.equal(request.current_text, "Nolan avance");
  assert.equal(request.canonical_scene.sceneNumber, scenePage.sceneNumber);
  assert.equal(request.visual_beat.visual_beat_digest, "a".repeat(64));
  assert.ok(request.previous_text);
  assert.ok(request.next_text);
});

test("production orders V21 word normalization before V20 text authority and cover generation", () => {
  const source = fs.readFileSync(new URL("../src/routes/preview.js", import.meta.url), "utf8");
  const normalizer = source.indexOf("normalizeManuscriptWordTargets({");
  const authority = source.indexOf("prepareNarrativeV3ProductionTextAuthority({");
  const cover = source.indexOf('updateJob(job.id, { step: "draft:cover" })');
  assert.ok(normalizer > 0);
  assert.ok(authority > normalizer);
  assert.ok(cover > authority);
});
