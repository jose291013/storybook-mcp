import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getWordsTargetByAge } from "../src/config/readingGuidance.js";
import {
  loadManuscript,
  parseManuscriptWire,
} from "../src/contracts/manuscriptV1.js";
import { compileNarrativeBookSpecV3 } from "../src/contracts/narrativeBookSpecV3.js";
import { compileObjectLifecycleProjection } from "../src/contracts/objectLifecycleProjection.js";
import { buildNarrativeV3ObjectFixture } from "../src/services/narrativeV3ObjectLifecycleMatrix.js";
import { JsonNarrativeV3RunStore } from "../src/services/narrativeV3StateMachine.js";

function fixture(raw = {}) {
  const source = buildNarrativeV3ObjectFixture(raw);
  const objectProjection = compileObjectLifecycleProjection({ graph: source.graph });
  const spec = compileNarrativeBookSpecV3({
    intent: source.intent,
    graph: source.graph,
    objectProjection,
    profileBindings: source.profileBindings,
  });
  return { ...source, objectProjection, spec };
}

function wireFor(spec) {
  const word = { FR: "histoire", ES: "historia", EN: "story" }[spec.book.language];
  return {
    schema_version: 1,
    contract_id: "calitiki.manuscript-wire.v1",
    source_spec_digest: spec.validation.artifactDigest,
    language: spec.book.language,
    pages: spec.pages
      .filter((page) => ["opening_text", "scene_text", "closing_text"].includes(page.kind))
      .map((page) => {
        const guidance = getWordsTargetByAge(spec.book.audienceAge, page.kind === "scene_text" ? "text" : page.kind);
        return { page_number: page.pageNumber, text: Array(guidance.target).fill(word).join(" ") };
      }),
  };
}

test("Manuscript.v1 binds every text page to the exact released scene and object state", () => {
  const { spec } = fixture({ language: "FR", universeId: "coral_ocean" });
  const manuscript = parseManuscriptWire({ spec, wire: wireFor(spec) });
  assert.equal(manuscript.sourceSpec.artifactDigest, spec.validation.artifactDigest);
  assert.equal(manuscript.pages.length, spec.scenes.length + 2);
  const scenePages = manuscript.pages.filter((page) => page.kind === "scene_text");
  scenePages.forEach((page) => {
    const scene = spec.scenes[page.sceneNumber - 1];
    assert.equal(page.sourceSceneDigest, scene.sourceSceneDigest);
    assert.equal(page.objectStateDigest, scene.objectStateDigest);
    assert.ok(page.wordCount >= page.wordTarget - page.wordTolerance);
    assert.ok(page.wordCount <= page.wordTarget + page.wordTolerance);
  });
  assert.equal(manuscript.pages[0].sceneNumber, null);
  assert.equal(manuscript.pages.at(-1).objectStateDigest, null);
  assert.equal(Object.isFrozen(manuscript), true);
});

test("manuscript parsing is byte-identical and canonical loading fails closed on changes", () => {
  const { spec } = fixture({ language: "ES", universeId: "dinosaur_valley" });
  const wire = wireFor(spec);
  const manuscript = parseManuscriptWire({ spec, wire });
  assert.deepEqual(parseManuscriptWire({ spec: structuredClone(spec), wire: structuredClone(wire) }), manuscript);
  assert.deepEqual(loadManuscript(structuredClone(manuscript)), manuscript);

  const tamperedText = structuredClone(manuscript);
  tamperedText.pages[0].text += " palabra";
  assert.throws(
    () => loadManuscript(tamperedText),
    (error) => error.code === "manuscript_word_count_mismatch",
  );
  const tamperedDigest = structuredClone(manuscript);
  tamperedDigest.validation.artifactDigest = "f".repeat(64);
  assert.throws(
    () => loadManuscript(tamperedDigest),
    (error) => error.code === "manuscript_digest_mismatch",
  );
});

test("wire output cannot omit, duplicate or invent a page", () => {
  const { spec } = fixture({ language: "EN", universeId: "starry_space" });
  const missing = wireFor(spec);
  missing.pages.pop();
  assert.throws(
    () => parseManuscriptWire({ spec, wire: missing }),
    (error) => error.code === "manuscript_page_set_mismatch",
  );
  const duplicate = wireFor(spec);
  duplicate.pages[1].page_number = duplicate.pages[0].page_number;
  assert.throws(
    () => parseManuscriptWire({ spec, wire: duplicate }),
    (error) => error.code === "manuscript_page_duplicate",
  );
  const invented = wireFor(spec);
  invented.pages[0].mechanics = { move: "somewhere" };
  assert.throws(
    () => parseManuscriptWire({ spec, wire: invented }),
    (error) => error.artifactType === "manuscript_wire_v1",
  );
});

test("wrong ancestry, language and age-bound length are rejected before persistence", () => {
  const { spec } = fixture({ language: "FR", universeId: "enchanted_forest" });
  const foreign = wireFor(spec);
  foreign.source_spec_digest = "a".repeat(64);
  assert.throws(
    () => parseManuscriptWire({ spec, wire: foreign }),
    (error) => error.code === "manuscript_source_spec_mismatch",
  );
  const language = wireFor(spec);
  language.language = "EN";
  assert.throws(
    () => parseManuscriptWire({ spec, wire: language }),
    (error) => error.code === "manuscript_language_mismatch",
  );
  const tooShort = wireFor(spec);
  tooShort.pages[1].text = "trop court";
  assert.throws(
    () => parseManuscriptWire({ spec, wire: tooShort }),
    (error) => error.code === "manuscript_word_target_missed",
  );
});

test("the manuscript durable step accepts only one exact V3 release parent", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-v3-manuscript-step-"));
  try {
    const store = new JsonNarrativeV3RunStore(path.join(directory, "runs.json"));
    await assert.rejects(
      store.enqueue({
        projectId: crypto.randomUUID(),
        runKey: "invalid-manuscript-parent",
        steps: [{
          stepKey: "write",
          stepType: "write_manuscript",
          inputs: [{
            artifactId: crypto.randomUUID(),
            artifactType: "narrative_book_spec",
            artifactDigest: "b".repeat(64),
          }],
        }],
      }),
      (error) => error.code === "invalid_step_inputs",
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("migration 022 adds only the isolated manuscript artifact and step", async () => {
  const migration = await fs.readFile("db/migrations/022_narrative_v3_manuscript.sql", "utf8");
  assert.match(migration, /'manuscript'/);
  assert.match(migration, /'write_manuscript'/);
  assert.doesNotMatch(migration, /book_projects\s+ADD|UPDATE\s+book_projects/i);
});
