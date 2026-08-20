import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getWordsTargetByAge } from "../src/config/readingGuidance.js";
import { parseManuscriptWire } from "../src/contracts/manuscriptV1.js";
import {
  compileManuscriptFactEvidence,
  loadManuscriptFactEvidence,
} from "../src/contracts/manuscriptFactEvidenceV1.js";
import { compileNarrativeBookSpecV3 } from "../src/contracts/narrativeBookSpecV3.js";
import { compileObjectLifecycleProjection } from "../src/contracts/objectLifecycleProjection.js";
import { compileVisualStoryboard } from "../src/contracts/visualStoryboardV1.js";
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
  const word = { FR: "histoire", ES: "historia", EN: "story" }[spec.book.language];
  const wire = {
    schema_version: 1,
    contract_id: "calitiki.manuscript-wire.v1",
    source_spec_digest: spec.validation.artifactDigest,
    language: spec.book.language,
    pages: spec.pages.filter((page) => ["opening_text", "scene_text", "closing_text"].includes(page.kind)).map((page) => {
      const guidance = getWordsTargetByAge(spec.book.audienceAge, page.kind === "scene_text" ? "text" : page.kind);
      return { page_number: page.pageNumber, text: Array(guidance.target).fill(word).join(" ") };
    }),
  };
  return { ...source, spec, wire };
}

test("ManuscriptFactEvidence.v1 projects exact physical, evoked, object and visual facts before storyboard compilation", () => {
  const { spec, wire } = fixture({ language: "FR", universeId: "enchanted_forest" });
  const manuscript = parseManuscriptWire({ spec, wire });
  const evidence = compileManuscriptFactEvidence({ spec, manuscript });
  assert.equal(evidence.pages.length, manuscript.pages.length);
  const scenePages = evidence.pages.filter((page) => page.kind === "scene_text");
  scenePages.forEach((page) => {
    const scene = spec.scenes[page.sceneNumber - 1];
    assert.deepEqual(page.visualRequirements.requiredCharacterIds, [...scene.illustrationInstant.visibleCharacterIds].sort());
    assert.equal(page.visualRequirements.locationId, scene.illustrationInstant.locationId);
    assert.equal(page.checks.visualProjection, "pass");
  });
  assert.deepEqual(loadManuscriptFactEvidence(structuredClone(evidence)), evidence);
  const storyboard = compileVisualStoryboard({ spec, manuscript, factEvidence: evidence });
  assert.equal(storyboard.sources.manuscriptFactEvidence.artifactDigest, evidence.validation.artifactDigest);
});

test("a named character, place or object absent from the released scene is rejected deterministically", () => {
  const { spec, wire } = fixture({ language: "EN", universeId: "starry_space" });
  const scene = spec.scenes.find((entry) => entry.illustrationInstant.forbiddenCharacterIds.length);
  assert.ok(scene);
  const forbiddenId = scene.illustrationInstant.forbiddenCharacterIds[0];
  const forbiddenName = spec.registries.characters.find((entry) => entry.id === forbiddenId).displayName;
  const pageNumber = scene.pageBinding.textPageNumber;
  const page = wire.pages.find((entry) => entry.page_number === pageNumber);
  page.text = `${forbiddenName} ${page.text}`;
  const manuscript = parseManuscriptWire({ spec, wire });
  assert.throws(
    () => compileManuscriptFactEvidence({ spec, manuscript }),
    (error) => error.code === "manuscript_character_fact_unregistered",
  );
});

test("fact evidence is immutable, digest-bound and refuses a foreign manuscript", () => {
  const first = fixture({ language: "ES", universeId: "dinosaur_valley" });
  const second = fixture({ language: "ES", universeId: "wonder_city" });
  const firstManuscript = parseManuscriptWire({ spec: first.spec, wire: first.wire });
  const evidence = compileManuscriptFactEvidence({ spec: first.spec, manuscript: firstManuscript });
  assert.equal(Object.isFrozen(evidence), true);
  const changed = structuredClone(evidence);
  changed.pages[1].allowedLocationIds.push("invented_location");
  assert.throws(() => loadManuscriptFactEvidence(changed), (error) => error.code === "manuscript_fact_page_digest_mismatch");
  const secondManuscript = parseManuscriptWire({ spec: second.spec, wire: second.wire });
  assert.throws(
    () => compileManuscriptFactEvidence({ spec: first.spec, manuscript: secondManuscript }),
    (error) => error.code === "manuscript_fact_source_mismatch",
  );
});

test("the durable fact-evidence step requires exact ordered spec and manuscript parents", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-v3-manuscript-facts-"));
  try {
    const store = new JsonNarrativeV3RunStore(path.join(directory, "runs.json"));
    await assert.rejects(
      store.enqueue({
        projectId: crypto.randomUUID(),
        runKey: "invalid-manuscript-fact-parent",
        steps: [{
          stepKey: "compile",
          stepType: "compile_manuscript_fact_evidence",
          inputs: [
            { artifactId: crypto.randomUUID(), artifactType: "manuscript", artifactDigest: "a".repeat(64) },
            { artifactId: crypto.randomUUID(), artifactType: "narrative_book_spec_v3", artifactDigest: "b".repeat(64) },
          ],
        }],
      }),
      (error) => error.code === "invalid_step_inputs",
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("migration 030 widens only isolated V3 artifacts and steps", async () => {
  const migration = await fs.readFile("db/migrations/030_narrative_v3_manuscript_fact_evidence.sql", "utf8");
  assert.match(migration, /'manuscript_fact_evidence'/);
  assert.match(migration, /'compile_manuscript_fact_evidence'/);
  assert.doesNotMatch(migration, /book_projects\s+ADD|UPDATE\s+book_projects/i);
});
