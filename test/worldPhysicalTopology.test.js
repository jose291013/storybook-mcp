import assert from "node:assert/strict";
import test from "node:test";

import { UNIVERSE_OPTIONS } from "../src/config/bookOptions.js";
import {
  cameraBoundaryRule,
  compileWorldPhysicalTopology,
  worldPhysicalTopologyContractIssues,
  worldSideForLocation,
} from "../src/services/worldPhysicalTopology.js";

function passageScenario() {
  return {
    scenes: [
      {
        sceneNumber: 1,
        locationBefore: "familiar origin",
        locationAfter: "familiar origin",
        transition: { kind: "discover_passage", mechanismId: "stable_entry" },
      },
      {
        sceneNumber: 2,
        locationBefore: "familiar origin",
        locationAfter: "adventure destination",
        transition: { kind: "cross_passage", mechanismId: "stable_entry" },
      },
      {
        sceneNumber: 3,
        locationBefore: "adventure destination",
        locationAfter: "adventure destination",
        transition: { kind: "none", mechanismId: "" },
      },
      {
        sceneNumber: 4,
        locationBefore: "adventure destination",
        locationAfter: "familiar origin",
        transition: { kind: "return_travel", mechanismId: "stable_entry" },
      },
    ],
  };
}

test("all six universes expose a complete deterministic two-zone topology", () => {
  assert.equal(UNIVERSE_OPTIONS.length, 6);
  for (const universe of UNIVERSE_OPTIONS) {
    assert.deepEqual(worldPhysicalTopologyContractIssues(universe.storyContract), []);
    const topology = universe.storyContract.physicalTopology;
    assert.notEqual(topology.originZone, topology.adventureZone);
    assert.equal(topology.entryBoundary, "first_cross_passage");
  }
});

test("the first stable passage fixes origin, boundary, adventure and return for every universe", () => {
  const approvedScenario = passageScenario();
  for (const universe of UNIVERSE_OPTIONS) {
    const worldContract = universe.storyContract;
    const config = worldContract.physicalTopology;
    const origin = compileWorldPhysicalTopology({
      approvedScenario,
      approvedScene: approvedScenario.scenes[0],
      worldContract,
    });
    const boundary = compileWorldPhysicalTopology({
      approvedScenario,
      approvedScene: approvedScenario.scenes[1],
      worldContract,
      visiblePhase: "during",
    });
    const adventure = compileWorldPhysicalTopology({
      approvedScenario,
      approvedScene: approvedScenario.scenes[2],
      worldContract,
    });
    const returned = compileWorldPhysicalTopology({
      approvedScenario,
      approvedScene: approvedScenario.scenes[3],
      worldContract,
    });

    assert.equal(origin.camera_zone, config.originZone, universe.id);
    assert.equal(boundary.camera_zone, config.transitionZone, universe.id);
    assert.equal(boundary.before_zone, config.originZone, universe.id);
    assert.equal(boundary.after_zone, config.adventureZone, universe.id);
    assert.equal(adventure.camera_zone, config.adventureZone, universe.id);
    assert.equal(returned.camera_zone, config.originZone, universe.id);
    assert.equal(returned.entry_passage_id, "stable_entry", universe.id);
    assert.match(cameraBoundaryRule(adventure), /passage|boundary/iu);
  }
});

test("a universe-native story without a crossing stays wholly on the adventure side", () => {
  const approvedScenario = {
    scenes: [{
      sceneNumber: 1,
      locationBefore: "native place",
      locationAfter: "native place",
      transition: { kind: "none", mechanismId: "" },
    }],
  };
  for (const universe of UNIVERSE_OPTIONS) {
    const topology = compileWorldPhysicalTopology({
      approvedScenario,
      approvedScene: approvedScenario.scenes[0],
      worldContract: universe.storyContract,
    });
    assert.equal(topology.camera_side, "adventure", universe.id);
    assert.equal(topology.camera_zone, universe.storyContract.physicalTopology.adventureZone, universe.id);
    assert.equal(worldSideForLocation({
      approvedScenario,
      worldContract: universe.storyContract,
      location: "native place",
    }), "adventure", universe.id);
  }
});

test("legacy non-ocean contracts do not acquire a new topology during regeneration", () => {
  const approvedScenario = passageScenario();
  assert.equal(compileWorldPhysicalTopology({
    approvedScenario,
    approvedScene: approvedScenario.scenes[2],
    worldContract: { id: "enchanted_forest" },
  }), null);
});
