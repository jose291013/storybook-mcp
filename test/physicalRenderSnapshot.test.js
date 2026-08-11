import assert from "node:assert/strict";
import test from "node:test";

import {
  compilePhysicalRenderSnapshot,
  wardrobeForPhysicalSnapshot,
} from "../src/services/physicalRenderSnapshot.js";

const worldContract = {
  id: "coral_ocean",
  requiredMechanisms: [{ id: "breathing_and_voice_bubble" }],
};

const approvedScenario = {
  worldContract,
  objects: [{
    objectId: "phare_jardin_corail",
    name: "phare du jardin de corail",
    initialState: "visible",
    trackEveryScene: true,
    spatialMode: "location_bound",
    homeLocation: "jardin de corail",
  }],
  scenes: [
    { sceneNumber: 1, locationBefore: "atelier sec", locationAfter: "atelier sec", transition: { kind: "discover_passage", mechanismId: "arche_de_maree", mechanism: "arche de marée" }, objectStates: [{ objectId: "phare_jardin_corail", name: "phare du jardin de corail", state: "absent", quantity: 1 }] },
    { sceneNumber: 2, locationBefore: "atelier sec", locationAfter: "atelier sec", transition: { kind: "none", mechanismId: "", mechanism: "" }, objectStates: [{ objectId: "phare_jardin_corail", name: "phare du jardin de corail", state: "absent", quantity: 1 }] },
    { sceneNumber: 3, locationBefore: "atelier sec", locationAfter: "jardin de corail", transition: { kind: "cross_passage", mechanismId: "arche_de_maree", mechanism: "arche de marée" }, objectStates: [{ objectId: "phare_jardin_corail", name: "phare du jardin de corail", state: "visible", quantity: 1 }] },
    { sceneNumber: 4, locationBefore: "jardin de corail", locationAfter: "jardin de corail", transition: { kind: "none", mechanismId: "", mechanism: "" }, objectStates: [{ objectId: "phare_jardin_corail", name: "phare du jardin de corail", state: "visible", quantity: 1 }] },
    { sceneNumber: 5, locationBefore: "jardin de corail", locationAfter: "atelier sec", transition: { kind: "return_travel", mechanismId: "arche_de_maree", mechanism: "arche de marée" }, objectStates: [{ objectId: "phare_jardin_corail", name: "phare du jardin de corail", state: "absent", quantity: 1 }] },
  ],
};

function returnContract(state = "stored") {
  return {
    main_action: { subject: "Bastien", verb: "regarde", target: "son dessin" },
    named_characters: [
      { name: "Bastien", action: "regarde son dessin" },
      { name: "Marie", action: "reste près de Bastien" },
    ],
    object_states: [
      { name: "breathing_and_voice_bubble", owner: "Bastien", state, quantity: 1 },
      { name: "breathing_and_voice_bubble", owner: "Marie", state, quantity: 1 },
    ],
    causal_frame: {
      visible_phase: "after",
      visible_location: "atelier de dessin",
      during: { transition_kind: "return_travel" },
      after: { location: "atelier de dessin" },
    },
  };
}

test("the return snapshot keeps the workshop breathable and every bubble stored once", () => {
  const snapshot = compilePhysicalRenderSnapshot({
    contract: returnContract(),
    worldContract,
  });

  assert.equal(snapshot.visible_phase, "after");
  assert.equal(snapshot.location, "atelier de dessin");
  assert.equal(snapshot.physical_medium, "breathable_air");
  assert.deepEqual(snapshot.equipment.map((item) => [item.owner, item.state, item.quantity]), [
    ["Bastien", "stored", 1],
    ["Marie", "stored", 1],
  ]);
  assert.ok(snapshot.forbidden.some((item) => /not worn/u.test(item)));
  assert.ok(snapshot.forbidden.some((item) => /No character wears underwater/u.test(item)));
});

test("the underwater snapshot requires one worn breathing mechanism per person", () => {
  const contract = returnContract("worn");
  contract.causal_frame.visible_location = "jardin de corail";
  const snapshot = compilePhysicalRenderSnapshot({ contract, worldContract });

  assert.equal(snapshot.physical_medium, "fully_underwater");
  assert.ok(snapshot.forbidden.every((item) => !/No character wears underwater/u.test(item)));
  assert.ok(snapshot.forbidden.some((item) => /exactly their own declared worn/u.test(item)));
});

test("a return crossing renders the previous worn state rather than the final stored state", () => {
  const contract = returnContract("stored");
  contract.causal_frame.visible_phase = "during";
  contract.causal_frame.visible_location = "passage aquatique";
  const previousScene = {
    objectStates: [
      { name: "breathing_and_voice_bubble", owner: "Bastien", state: "worn", quantity: 1 },
      { name: "breathing_and_voice_bubble", owner: "Marie", state: "worn", quantity: 1 },
    ],
  };
  const snapshot = compilePhysicalRenderSnapshot({
    contract,
    previousScene,
    worldContract,
  });

  assert.equal(snapshot.physical_medium, "passage_transition");
  assert.deepEqual(snapshot.equipment.map((item) => item.state), ["worn", "worn"]);
  assert.deepEqual(snapshot.visible_object_states.map((item) => item.state), ["worn", "worn"]);
});

test("stored conditional equipment is removed from the persistent aquatic outfit", () => {
  const snapshot = compilePhysicalRenderSnapshot({
    contract: returnContract(),
    worldContract,
  });
  const outfit = wardrobeForPhysicalSnapshot(
    "a turquoise full-body wetsuit with reef shoes and the story-established breathing mechanism",
    "Bastien",
    snapshot,
  );

  assert.match(outfit, /turquoise full-body wetsuit/u);
  assert.match(outfit, /reef shoes/u);
  assert.doesNotMatch(outfit, /breathing mechanism/u);
});

test("camera-side topology keeps equipment preparation dry before the ocean crossing", () => {
  const contract = returnContract("worn");
  contract.causal_frame.visible_location = "atelier sec";
  contract.causal_frame.during.transition_kind = "none";
  const snapshot = compilePhysicalRenderSnapshot({
    contract,
    approvedScene: approvedScenario.scenes[1],
    approvedScenario,
    worldContract,
  });

  assert.equal(snapshot.physical_medium, "breathable_air");
  assert.equal(snapshot.camera_environment.camera_side, "origin");
  assert.equal(snapshot.camera_environment.other_side_medium, "fully_underwater");
  assert.match(snapshot.camera_environment.boundary_rule, /camera side is dry breathable air/iu);
  assert.doesNotMatch(snapshot.forbidden.join(" "), /No character wears underwater breathing equipment/iu);
});

test("the entry passage topology determines underwater medium independently from equipment state", () => {
  const contract = returnContract("stored");
  contract.causal_frame.visible_location = "jardin de corail";
  contract.causal_frame.during.transition_kind = "none";
  const snapshot = compilePhysicalRenderSnapshot({
    contract,
    approvedScene: approvedScenario.scenes[3],
    approvedScenario,
    worldContract,
  });

  assert.equal(snapshot.physical_medium, "fully_underwater");
  assert.equal(snapshot.camera_environment.camera_side, "adventure");
  assert.ok(snapshot.forbidden.some((item) => /declared worn breathing equipment/iu.test(item)));
});

test("the same entry passage deterministically returns the camera to breathable air", () => {
  const snapshot = compilePhysicalRenderSnapshot({
    contract: returnContract("stored"),
    approvedScene: approvedScenario.scenes[4],
    approvedScenario,
    worldContract,
  });

  assert.equal(snapshot.physical_medium, "breathable_air");
  assert.equal(snapshot.camera_environment.camera_side, "origin");
  assert.equal(snapshot.camera_environment.entry_passage_id, "arche_de_maree");
});

test("a unique underwater landmark cannot move onto the dry camera side", () => {
  const contract = returnContract("worn");
  contract.causal_frame.visible_location = "atelier sec";
  contract.causal_frame.during.transition_kind = "none";
  const snapshot = compilePhysicalRenderSnapshot({
    contract,
    approvedScene: approvedScenario.scenes[1],
    approvedScenario,
    worldContract,
  });

  const [lighthouse] = snapshot.fixed_entities;
  assert.equal(lighthouse.home_side, "adventure");
  assert.equal(lighthouse.camera_side, "origin");
  assert.equal(lighthouse.status, "other_side_only");
  assert.equal(lighthouse.camera_quantity, 0);
  assert.equal(lighthouse.other_side_quantity_limit, 1);
  assert.equal(lighthouse.global_quantity_limit, 1);
  assert.match(lighthouse.rule, /only beyond the established bounded passage/iu);
  assert.deepEqual(lighthouse.adjacent_visibility.map((item) => item.status), [
    "other_side_only",
    "other_side_only",
    "visible_once",
  ]);
});

test("a landmark is visible once at its canonical home with adjacent-scene continuity", () => {
  const contract = returnContract("worn");
  contract.causal_frame.visible_location = "jardin de corail";
  contract.causal_frame.during.transition_kind = "none";
  const snapshot = compilePhysicalRenderSnapshot({
    contract,
    approvedScene: approvedScenario.scenes[3],
    approvedScenario,
    worldContract,
  });

  const [lighthouse] = snapshot.fixed_entities;
  assert.equal(lighthouse.status, "visible_once");
  assert.equal(lighthouse.camera_quantity, 1);
  assert.match(lighthouse.rule, /no duplicate, twin, miniature copy or second background version/iu);
  assert.deepEqual(lighthouse.adjacent_visibility.map((item) => item.status), [
    "visible_once",
    "visible_once",
    "other_side_only",
  ]);
});
