import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  NARRATIVE_BOOK_SPEC_ID,
  NARRATIVE_BOOK_SPEC_VERSION,
  narrativeBookSpecDigest,
  validateNarrativeBookSpec,
} from "../src/contracts/narrativeBookSpec.js";

const schemaUrl = new URL("../src/contracts/narrativeBookSpec.v1.schema.json", import.meta.url);
const exampleUrl = new URL("../src/contracts/narrativeBookSpec.v1.example.json", import.meta.url);

function fixture() {
  return JSON.parse(fs.readFileSync(exampleUrl, "utf8"));
}

test("canonical schema and reference fixture declare the same immutable contract", () => {
  const schema = JSON.parse(fs.readFileSync(schemaUrl, "utf8"));
  const example = fixture();

  assert.equal(schema.properties.schemaVersion.const, NARRATIVE_BOOK_SPEC_VERSION);
  assert.equal(schema.properties.contractId.const, NARRATIVE_BOOK_SPEC_ID);
  assert.equal(example.schemaVersion, NARRATIVE_BOOK_SPEC_VERSION);
  assert.equal(example.contractId, NARRATIVE_BOOK_SPEC_ID);
  assert.ok(schema.required.includes("safety"));
  assert.ok(schema.required.includes("registries"));
  assert.ok(schema.required.includes("scenes"));
});

test("reference canonical book passes deterministic mechanical validation", () => {
  const example = fixture();
  const result = validateNarrativeBookSpec(example);

  assert.equal(result.valid, true, JSON.stringify(result.issues, null, 2));
  assert.equal(result.digest, example.validation.artifactDigest);
});

test("digest is stable across object key insertion order and excludes audit evidence", () => {
  const example = fixture();
  const reordered = {
    validation: example.validation,
    scenes: example.scenes,
    registries: example.registries,
    safety: example.safety,
    book: example.book,
    sourceScenario: example.sourceScenario,
    revision: example.revision,
    contractId: example.contractId,
    schemaVersion: example.schemaVersion,
  };
  reordered.validation = {
    ...reordered.validation,
    mechanicalValidatorVersion: 99,
    semanticAudit: {
      ...reordered.validation.semanticAudit,
      status: "advisory",
      auditedAt: "2030-01-01T00:00:00.000Z",
    },
  };

  assert.equal(narrativeBookSpecDigest(reordered), narrativeBookSpecDigest(example));
});

test("digest changes with the compiler version but not project timestamps or revisions", () => {
  const example = fixture();
  const operationallyReissued = structuredClone(example);
  operationallyReissued.revision = 9;
  operationallyReissued.sourceScenario.projectId = "another-owned-project";
  operationallyReissued.sourceScenario.revision = 4;
  operationallyReissued.sourceScenario.approvedAt = "2030-01-01T00:00:00.000Z";
  assert.equal(narrativeBookSpecDigest(operationallyReissued), narrativeBookSpecDigest(example));

  operationallyReissued.validation.compilerVersion = 2;
  assert.notEqual(narrativeBookSpecDigest(operationallyReissued), narrativeBookSpecDigest(example));
});

test("a character left in the adventure world cannot reappear in the porch illustration", () => {
  const example = fixture();
  const returnScene = example.scenes.find((scene) => scene.id === "scene-3");
  returnScene.illustration.visibleCharacterIds.push("forest_fairy");

  const result = validateNarrativeBookSpec(example, { verifyDigest: false });

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "visible_cast_mismatch"));
});

test("every absent canonical character is explicitly forbidden from the visible moment", () => {
  const example = fixture();
  const returnScene = example.scenes.find((scene) => scene.id === "scene-3");
  returnScene.illustration.forbiddenCharacterIds = [];

  const result = validateNarrativeBookSpec(example, { verifyDigest: false });

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "forbidden_cast_mismatch"));
});

test("nonphysical characters cannot move or enter the visible cast", () => {
  const example = fixture();
  const returnScene = example.scenes.find((scene) => scene.id === "scene-3");
  returnScene.presences.push({
    characterId: "forest_fairy",
    mode: "memory",
    phase: "",
    locationId: "",
    action: "Bastien se souvient de son conseil",
  });
  returnScene.illustration.evokedCharacterIds = ["forest_fairy"];
  returnScene.illustration.forbiddenCharacterIds = [];
  returnScene.movements[0].travelerCharacterIds.push("forest_fairy");

  const result = validateNarrativeBookSpec(example, { verifyDigest: false });

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "nonphysical_traveler"));
});

test("an absent or transformed object cannot silently reappear without a causal event", () => {
  const example = fixture();
  const returnScene = example.scenes.find((scene) => scene.id === "scene-3");
  returnScene.objectStates[0] = {
    objectId: "bond_flower",
    state: "held",
    quantity: 1,
    ownerCharacterId: "bastien",
    eventId: null,
  };

  const result = validateNarrativeBookSpec(example, { verifyDigest: false });

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "object_changed_without_event"));
});

test("restricted safety input cannot produce a canonical narrative contract", () => {
  const example = fixture();
  example.safety.childSafety = {
    profileVersion: 2,
    category: "possible_abuse_disclosure",
    action: "support",
    restricted: true,
  };

  const result = validateNarrativeBookSpec(example, { verifyDigest: false });

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "unsafe_contract_compilation"));
});
