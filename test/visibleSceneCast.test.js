import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalSceneVisiblePhase,
  characterTravelsInScenario,
  physicalPresencesForVisibleInstant,
} from "../src/services/visibleSceneCast.js";

const scene = {
  characterPresences: [
    { name: "Papa", mode: "physical", phase: "start" },
    { name: "Noa", mode: "physical", phase: "end" },
    { name: "Maman", mode: "physical", phase: "throughout" },
  ],
  transition: { characters: ["Noa"] },
  characterMovements: [{ characters: ["Noa"] }],
};

test("visible cast follows the selected scene instant", () => {
  assert.equal(canonicalSceneVisiblePhase(scene), "after");
  assert.deepEqual(
    physicalPresencesForVisibleInstant(scene, "before").map((presence) => presence.name),
    ["Papa", "Maman"],
  );
  assert.deepEqual(
    physicalPresencesForVisibleInstant(scene, "during").map((presence) => presence.name),
    ["Noa", "Maman"],
  );
  assert.deepEqual(
    physicalPresencesForVisibleInstant(scene, "after").map((presence) => presence.name),
    ["Noa", "Maman"],
  );
});

test("travel participation is derived from movements rather than scene presence", () => {
  const scenario = { scenes: [scene] };
  assert.equal(characterTravelsInScenario(scenario, "Noa"), true);
  assert.equal(characterTravelsInScenario(scenario, "Papa"), false);
});
