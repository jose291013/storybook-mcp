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
