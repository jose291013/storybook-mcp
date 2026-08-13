import assert from "node:assert/strict";
import test from "node:test";

import { canonicalizeNarrativeMovements } from "../src/contracts/canonicalizeNarrativeMovements.js";

function scene({
  number = 1,
  before = "cabine protégée",
  after = "terrasse",
  names = ["Noa", "Kovu", "Antonio", "Eva"],
  movements = [],
} = {}) {
  return {
    id: `scene-${number}`,
    sceneNumber: number,
    locationBefore: before,
    locationAfter: after,
    characterPresences: names.map((name) => ({
      name,
      mode: "physical",
      phase: "end",
      location: after,
    })),
    transition: movements[0] ? { ...movements[0] } : {
      kind: "none",
      mechanism: "",
      mechanismId: "",
      from: before,
      to: after,
      characters: [],
    },
    characterMovements: movements,
  };
}

test("canonicalizer rebuilds a stale shared origin then completes the final local leg", () => {
  const names = ["Noa", "Kovu", "Antonio", "Eva"];
  const input = {
    characters: names.map((name) => ({ name, initialLocation: "cabine protégée" })),
    scenes: [scene({
      names,
      movements: [{
        id: "legacy-return",
        kind: "return_travel",
        from: "Nave Brújula",
        to: "corridor de retour",
        characters: names,
        mechanism: "corridor de retour",
        mechanismId: "return_corridor",
      }],
    })],
  };

  const { scenario, report } = canonicalizeNarrativeMovements(input);

  assert.equal(report.repairedOrigins, 4);
  assert.equal(report.inferredFinalLegs, 4);
  assert.deepEqual(report.sceneNumbers, [1]);
  assert.deepEqual(scenario.scenes[0].characterMovements.map((movement) => ({
    kind: movement.kind,
    from: movement.from,
    to: movement.to,
    characters: movement.characters,
  })), [
    {
      kind: "return_travel",
      from: "cabine protégée",
      to: "corridor de retour",
      characters: names,
    },
    {
      kind: "ordinary_travel",
      from: "corridor de retour",
      to: "terrasse",
      characters: names,
    },
  ]);
  assert.equal(scenario.scenes[0].transition.from, "cabine protégée");
  assert.equal(input.scenes[0].characterMovements[0].from, "Nave Brújula", "input stays immutable");
});

test("canonicalizer splits travelers by actual origin and drops redundant legs", () => {
  const input = {
    characters: [
      { name: "Noa", initialLocation: "cabine" },
      { name: "Kovu", initialLocation: "cabine" },
      { name: "Eva", initialLocation: "terrasse" },
    ],
    scenes: [scene({
      names: ["Noa", "Kovu", "Eva"],
      before: "cabine",
      after: "terrasse",
      movements: [{
        kind: "ordinary_travel",
        from: "cabine",
        to: "terrasse",
        characters: ["Noa", "Kovu", "Eva"],
        mechanism: "",
        mechanismId: "",
      }],
    })],
  };

  const { scenario, report } = canonicalizeNarrativeMovements(input);
  assert.equal(report.removedRedundantLegs, 1);
  assert.deepEqual(scenario.scenes[0].characterMovements[0].characters, ["Noa", "Kovu"]);
});

test("canonicalizer is idempotent across traveler ordering", () => {
  const names = ["Noa", "Kovu", "Antonio", "Eva"];
  for (let offset = 0; offset < names.length; offset += 1) {
    const ordered = [...names.slice(offset), ...names.slice(0, offset)];
    const input = {
      characters: names.map((name) => ({ name, initialLocation: "cabine" })),
      scenes: [scene({
        names,
        movements: [{
          kind: "ordinary_travel",
          from: "ancien libellé",
          to: "terrasse",
          characters: ordered,
        }],
      })],
    };
    const first = canonicalizeNarrativeMovements(input).scenario;
    const second = canonicalizeNarrativeMovements(first);
    assert.deepEqual(second.scenario, first);
    assert.equal(second.report.changed, false);
  }
});

test("canonicalizer preserves a valid custom movement id", () => {
  const input = {
    characters: [{ name: "Noa", initialLocation: "cabine" }],
    scenes: [scene({
      names: ["Noa"],
      before: "cabine",
      after: "terrasse",
      movements: [{
        id: "approved-arrival",
        kind: "ordinary_travel",
        from: "cabine",
        to: "terrasse",
        characters: ["Noa"],
      }],
    })],
  };
  const { scenario, report } = canonicalizeNarrativeMovements(input);
  assert.equal(report.changed, false);
  assert.equal(scenario.scenes[0].characterMovements[0].id, "approved-arrival");
});

test("canonicalizer never merges different final destinations", () => {
  const input = {
    characters: [
      { name: "Noa", initialLocation: "cabine" },
      { name: "Kovu", initialLocation: "cabine" },
    ],
    scenes: [{
      ...scene({ names: [] }),
      characterPresences: [
        { name: "Noa", mode: "physical", phase: "end", location: "terrasse" },
        { name: "Kovu", mode: "physical", phase: "end", location: "jardin" },
      ],
    }],
  };

  const { scenario, report } = canonicalizeNarrativeMovements(input);
  assert.equal(report.inferredFinalLegs, 2);
  assert.deepEqual(scenario.scenes[0].characterMovements.map(({ from, to, characters }) => ({
    from,
    to,
    characters,
  })), [
    { from: "cabine", to: "terrasse", characters: ["Noa"] },
    { from: "cabine", to: "jardin", characters: ["Kovu"] },
  ]);
});

test("canonicalizer reports and resynchronizes a stale focal transition", () => {
  const input = {
    characters: [{ name: "Noa", initialLocation: "cabine" }],
    scenes: [scene({
      names: ["Noa"],
      before: "cabine",
      after: "terrasse",
      movements: [{
        id: "arrival",
        kind: "ordinary_travel",
        from: "cabine",
        to: "terrasse",
        characters: ["Noa"],
      }],
    })],
  };
  input.scenes[0].transition.from = "ancien lieu";

  const { scenario, report } = canonicalizeNarrativeMovements(input);
  assert.equal(report.changed, true);
  assert.deepEqual(report.sceneNumbers, [1]);
  assert.equal(scenario.scenes[0].transition.from, "cabine");
});
