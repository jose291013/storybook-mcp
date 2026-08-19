import assert from "node:assert/strict";
import test from "node:test";

import { sceneContractImagePrompt } from "../src/agents/storyScenePlanner.js";
import {
  compileVisualEntityLedger,
  visualEntityLedgerIssues,
  VISUAL_ENTITY_LEDGER_VERSION,
} from "../src/services/visualEntityLedger.js";

function contract(sceneNumber, objectStates = [], visualEntityStates = []) {
  return {
    scene_number: sceneNumber,
    main_action: { subject: "Nolan", verb: "guides", target: "the ball" },
    named_characters: [{ name: "Nolan", action: "guides the ball" }],
    object_states: objectStates,
    visual_entity_states: visualEntityStates,
    required_elements: [],
    spatial_relationships: [],
    forbidden_elements: [],
    causal_frame: { visible_location: "the workshop" },
  };
}

test("one canonical object id becomes one exact whole-image entity", () => {
  const plan = compileVisualEntityLedger({
    sceneContracts: [
      contract(1, [{ entity_id: "object_ball", name: "luminous ball", state: "held", owner: "Nolan", quantity: 1 }]),
      contract(2, [{ entity_id: "object_ball", name: "luminous ball", state: "visible", quantity: 1 }]),
    ],
  });

  assert.equal(plan.visualEntityLedger.version, VISUAL_ENTITY_LEDGER_VERSION);
  assert.equal(plan.visualEntityLedger.entities.length, 1);
  assert.equal(plan.visualEntityLedger.entities[0].entity_id, "object_ball");
  assert.equal(plan.sceneContracts[0].visual_entity_states[0].exact_quantity, 1);
  assert.match(plan.sceneContracts[0].visual_entity_states[0].instruction, /one and only one instance/i);
  assert.match(plan.sceneContracts[0].visual_entity_states[0].instruction, /alternate-position copy/i);
  assert.deepEqual(visualEntityLedgerIssues(plan), []);
});

test("a created group preserves exactly three members and its appearance lock", () => {
  const plan = compileVisualEntityLedger({
    visualEntityRegistry: [{
      semantic_key: "training_circles",
      name: "three chalk circles",
      kind: "set",
      quantity: 3,
      appearance: {
        size: "three equal child-sized circles",
        colors: ["white chalk"],
        material: "chalk",
        distinguishing_features: ["same diameter", "even spacing"],
      },
      created_scene_number: 2,
    }],
    sceneContracts: [
      contract(1),
      contract(2, [], [{ semantic_key: "training_circles", state: "created", location: "workshop floor", quantity: 3 }]),
      contract(3, [], [{ semantic_key: "training_circles", state: "present", location: "workshop floor", quantity: 3 }]),
    ],
  });

  const [before, created, later] = plan.sceneContracts.map((scene) => scene.visual_entity_states[0]);
  assert.deepEqual([before.visibility, before.exact_quantity], ["forbidden", 0]);
  assert.deepEqual([created.visibility, created.exact_quantity], ["required", 3]);
  assert.deepEqual([later.visibility, later.exact_quantity], ["required", 3]);
  assert.deepEqual(created.appearance_lock, later.appearance_lock);
  assert.match(later.instruction, /one persistent group containing exactly 3 members/i);
  assert.deepEqual(visualEntityLedgerIssues(plan), []);
});

test("the image prompt forbids time-lapse duplication of a persistent entity", () => {
  const plan = compileVisualEntityLedger({
    sceneContracts: [contract(1, [{ entity_id: "object_ball", name: "ball", state: "visible", quantity: 1 }])],
  });
  const prompt = sceneContractImagePrompt({ contract: plan.sceneContracts[0] });
  assert.match(prompt, /AUTHORITATIVE PERSISTENT VISUAL ENTITIES/);
  assert.match(prompt, /Count every instance across the entire image/);
  assert.match(prompt, /Never depict the same entity twice/);
});

test("a semantic proposal merges with the canonical object id and recompiles idempotently", () => {
  const compiled = compileVisualEntityLedger({
    visualEntityRegistry: [{
      semantic_key: "ball",
      name: "luminous ball",
      quantity: 1,
      appearance: { size: "child-sized", colors: ["gold"], material: "leather" },
    }],
    sceneContracts: [contract(1, [{ entity_id: "object_ball", name: "luminous ball", state: "held", quantity: 1 }], [
      { semantic_key: "ball", name: "luminous ball", state: "held", quantity: 1 },
    ])],
  });
  const recompiled = compileVisualEntityLedger(compiled);
  assert.equal(compiled.visualEntityLedger.entities.length, 1);
  assert.equal(compiled.visualEntityLedger.entities[0].entity_id, "object_ball");
  assert.deepEqual(compiled.visualEntityLedger.entities[0].appearance_lock.colors, ["gold"]);
  assert.equal(recompiled.visualEntityLedger.digest, compiled.visualEntityLedger.digest);
  assert.deepEqual(recompiled.sceneContracts[0].visual_entity_states, compiled.sceneContracts[0].visual_entity_states);
});

test("canonical lifecycle events may change quantity without weakening immutable visual groups", () => {
  const plan = compileVisualEntityLedger({
    sceneContracts: [
      contract(1, [{ entity_id: "object_tokens", name: "story tokens", state: "visible", quantity: 3 }]),
      contract(2, [{ entity_id: "object_tokens", name: "story tokens", state: "visible", quantity: 2 }]),
      contract(3, [{ entity_id: "object_tokens", name: "story tokens", state: "stored", quantity: 2 }]),
    ],
  });

  const states = plan.sceneContracts.map((scene) => scene.visual_entity_states[0]);
  assert.equal(plan.visualEntityLedger.entities[0].quantity_policy, "causal_state");
  assert.deepEqual(states.map((state) => state.exact_quantity), [3, 2, 0]);
  assert.equal(states[2].state, "stored");
  assert.equal(states[2].visibility, "forbidden");
  assert.match(states[2].instruction, /canonical state is stored: render zero instances/i);
  assert.deepEqual(visualEntityLedgerIssues(plan), []);
});
