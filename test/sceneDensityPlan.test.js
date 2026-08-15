import assert from "node:assert/strict";
import test from "node:test";

import { compileSceneDensityPlan, sceneDensityPlanIssues } from "../src/services/sceneDensityPlan.js";

const input = {
  mainAction: { subject: "Noa", verb: "places", target: "the glowing seed" },
  namedCharacters: [{ name: "Noa" }, { name: "Maman" }, { name: "Kovu" }],
  requiredElements: [{ description: "the glowing seed" }, { description: "the coral gate" }],
  objectStates: [
    { name: "the glowing seed", state: "held", quantity: 1 },
    { name: "the map", state: "visible", quantity: 1 },
    { name: "the old key", state: "absent", quantity: 0 },
  ],
};

test("scene density makes younger images simpler without removing canonical support", () => {
  const young = compileSceneDensityPlan({ audienceAge: 3, ...input });
  const older = compileSceneDensityPlan({ audienceAge: 12, ...input });
  assert.equal(young.high_salience_limit, 2);
  assert.equal(young.decorative_detail_limit, 1);
  assert.equal(older.high_salience_limit, 3);
  assert.equal(older.decorative_detail_limit, 5);
  assert.deepEqual(young.primary_focus, ["Noa", "the glowing seed"]);
  assert.deepEqual(young.supporting_cast, ["Maman", "Kovu"]);
  assert.ok(young.supporting_elements.includes("the coral gate"));
  assert.ok(young.background_states.includes("the map: visible"));
  assert.ok(!young.background_states.some((state) => /old key/u.test(state)));
});

test("density validation rejects duplicated layers and missing hierarchy", () => {
  const density = compileSceneDensityPlan({ audienceAge: 7, ...input });
  const contract = { scene_number: 4, scene_density: density };
  assert.deepEqual(sceneDensityPlanIssues([contract]), []);
  contract.scene_density.supporting_cast.push("Noa");
  contract.scene_density.hierarchy_rule = "";
  const issues = sceneDensityPlanIssues([contract]);
  assert.ok(issues.includes("scene 4 density layers duplicate one visual entity"));
  assert.ok(issues.includes("scene 4 density hierarchy rules are missing"));
});
