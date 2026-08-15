import assert from "node:assert/strict";
import test from "node:test";

import { canonicalizeStoryScenarioPhysicalChronology } from "../src/services/storyPhysicalChronology.js";

const travelers = ["Noa", "Kovu", "Antonio", "Eva"];

function productionShape() {
  return {
    scenes: [{
      sceneNumber: 2,
      locationBefore: "Patio de casa de Noa",
      locationAfter: "Umbral de avellano",
      transition: {
        kind: "discover_passage",
        mechanism: "Arco de avellano",
        mechanismId: "arco_de_avellano",
        from: "Umbral de avellano",
        to: "Umbral de avellano",
        characters: travelers,
      },
      characterMovements: [{
        id: "movement-1",
        kind: "ordinary_travel",
        mechanism: "Sendero del jardín",
        mechanismId: "sendero_del_jardin",
        from: "Patio de casa de Noa",
        to: "Umbral de avellano",
        characters: travelers,
      }, {
        id: "movement-2",
        kind: "discover_passage",
        mechanism: "Arco de avellano",
        mechanismId: "arco_de_avellano",
        from: "Umbral de avellano",
        to: "Umbral de avellano",
        characters: travelers,
      }],
    }, {
      sceneNumber: 3,
      locationBefore: "Umbral de avellano",
      locationAfter: "Claro de entrada del bosque encantado",
      transition: {
        kind: "cross_passage",
        mechanism: "Arco de avellano",
        mechanismId: "arco_de_avellano",
        from: "Umbral de avellano",
        to: "Claro de entrada del bosque encantado",
        characters: travelers,
      },
      characterMovements: [],
    }, {
      sceneNumber: 15,
      locationBefore: "Pradera del picnic compartido",
      locationAfter: "Patio de casa de Noa",
      transition: {
        kind: "return_travel",
        mechanism: "Arco de avellano",
        mechanismId: "arco_de_avellano",
        from: "Claro de entrada del bosque encantado",
        to: "Patio de casa de Noa",
        characters: travelers,
      },
      characterMovements: [{
        id: "movement-1",
        kind: "ordinary_travel",
        mechanism: "Sendero musgoso",
        mechanismId: "sendero_musgoso",
        from: "Pradera del picnic compartido",
        to: "Claro de entrada del bosque encantado",
        characters: travelers,
      }, {
        id: "movement-2",
        kind: "return_travel",
        mechanism: "Arco de avellano",
        mechanismId: "arco_de_avellano",
        from: "Claro de entrada del bosque encantado",
        to: "Patio de casa de Noa",
        characters: travelers,
      }],
    }],
  };
}

test("physical chronology orders a discovery after its approach and expands a collapsed return", () => {
  const source = productionShape();
  const { scenario, report } = canonicalizeStoryScenarioPhysicalChronology(source);

  assert.deepEqual(report, {
    version: 1,
    changed: true,
    orderedDiscoveries: 1,
    completedPassageReturns: 1,
    addedOrdinaryLegs: 1,
    sceneNumbers: [2, 15],
  });
  assert.equal(scenario.scenes[0].transition.kind, "ordinary_travel");
  assert.deepEqual(scenario.scenes[0].characterMovements.map(({ kind, from, to }) => ({ kind, from, to })), [{
    kind: "ordinary_travel",
    from: "Patio de casa de Noa",
    to: "Umbral de avellano",
  }, {
    kind: "discover_passage",
    from: "Umbral de avellano",
    to: "Umbral de avellano",
  }]);
  assert.deepEqual(scenario.scenes[2].characterMovements.map(({ kind, from, to }) => ({ kind, from, to })), [{
    kind: "ordinary_travel",
    from: "Pradera del picnic compartido",
    to: "Claro de entrada del bosque encantado",
  }, {
    kind: "return_travel",
    from: "Claro de entrada del bosque encantado",
    to: "Umbral de avellano",
  }, {
    kind: "ordinary_travel",
    from: "Umbral de avellano",
    to: "Patio de casa de Noa",
  }]);
  assert.equal(source.scenes[2].transition.to, "Patio de casa de Noa", "the source remains immutable");
});

test("physical chronology is idempotent", () => {
  const first = canonicalizeStoryScenarioPhysicalChronology(productionShape());
  const second = canonicalizeStoryScenarioPhysicalChronology(first.scenario);

  assert.deepEqual(second.scenario, first.scenario);
  assert.equal(second.report.changed, false);
});

test("physical chronology refuses a collapsed return without an established ordinary outer route", () => {
  const source = productionShape();
  source.scenes[0].characterMovements = source.scenes[0].characterMovements.slice(1);
  source.scenes[0].locationBefore = source.scenes[0].locationAfter;
  const { scenario, report } = canonicalizeStoryScenarioPhysicalChronology(source);

  assert.equal(report.completedPassageReturns, 0);
  assert.equal(scenario.scenes[2].transition.to, "Patio de casa de Noa");
});

test("physical chronology refuses to choose between competing established passage pairs", () => {
  const source = productionShape();
  source.scenes.splice(2, 0, {
    sceneNumber: 8,
    locationBefore: "Umbral de avellano",
    locationAfter: "Torre",
    transition: {
      kind: "cross_passage",
      mechanism: "Arco de avellano",
      mechanismId: "arco_de_avellano",
      from: "Umbral de avellano",
      to: "Torre",
      characters: travelers,
    },
    characterMovements: [],
  });
  const { scenario, report } = canonicalizeStoryScenarioPhysicalChronology(source);

  assert.equal(report.completedPassageReturns, 0);
  assert.equal(scenario.scenes.at(-1).transition.to, "Patio de casa de Noa");
});
