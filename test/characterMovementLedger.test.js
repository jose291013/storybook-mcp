import test from "node:test";
import assert from "node:assert/strict";
import { validateCharacterMovementLedger } from "../src/services/characterMovementLedger.js";
import { stabilizeStoryScenario, validateStoryScenario } from "../src/services/storyScenario.js";

function scene({
  number,
  title,
  before,
  after = before,
  presences = [],
  movements = [],
  transition = null,
}) {
  return {
    id: `scene-${number}`,
    sceneNumber: number,
    storyRole: number === 1 ? "character_and_desire" : "external_problem",
    title,
    action: title,
    locationBefore: before,
    locationAfter: after,
    prerequisiteSceneIds: number === 1 ? [] : [`scene-${number - 1}`],
    characterPresences: presences,
    transition: transition || {
      kind: "none",
      mechanism: "",
      mechanismId: "",
      from: before,
      to: after,
      characters: [],
    },
    characterMovements: movements,
    objectStates: [],
  };
}

function physical(name, location, phase = "end") {
  return { name, mode: "physical", phase, location, action: "" };
}

test("the ledger groups independent arrivals by origin and never moves a resident", () => {
  const scenario = {
    title: "Les retrouvailles à l'atelier",
    summary: "Marie et Lina rejoignent Bastien depuis deux lieux différents.",
    characters: [
      { name: "Bastien", initialLocation: "atelier" },
      { name: "Marie", initialLocation: "maison" },
      { name: "Lina", initialLocation: "école" },
    ],
    objects: [],
    scenes: [
      scene({
        number: 1,
        title: "Bastien prépare l'atelier",
        before: "atelier",
        presences: [physical("Bastien", "atelier", "throughout")],
      }),
      scene({
        number: 2,
        title: "Marie et Lina rejoignent Bastien",
        before: "atelier",
        presences: [
          physical("Bastien", "atelier", "throughout"),
          physical("Marie", "atelier"),
          physical("Lina", "atelier"),
        ],
      }),
    ],
  };

  const stabilized = stabilizeStoryScenario(scenario);
  assert.deepEqual(stabilized.scenes[1].characterMovements.map((movement) => ({
    kind: movement.kind,
    from: movement.from,
    to: movement.to,
    characters: movement.characters,
  })), [
    { kind: "join_travel", from: "maison", to: "atelier", characters: ["Marie"] },
    { kind: "join_travel", from: "école", to: "atelier", characters: ["Lina"] },
  ]);
  assert.equal(stabilized.scenes[1].transition.kind, "none");
  assert.ok(stabilized.scenes[1].characterMovements.every((movement) => !movement.characters.includes("Bastien")));
  assert.deepEqual(validateStoryScenario(stabilized), { valid: true, issues: [] });
});

test("a group can separate, leave one resident behind and reunite later", () => {
  const scenario = {
    title: "La séparation et les retrouvailles",
    summary: "Marie rentre, Bastien poursuit sa route, puis elle le rejoint.",
    characters: [
      { name: "Bastien", initialLocation: "camp" },
      { name: "Marie", initialLocation: "camp" },
      { name: "Lina", initialLocation: "camp" },
    ],
    objects: [],
    scenes: [
      scene({
        number: 1,
        title: "Le groupe au camp",
        before: "camp",
        presences: [
          physical("Bastien", "camp", "throughout"),
          physical("Marie", "camp", "throughout"),
          physical("Lina", "camp", "throughout"),
        ],
      }),
      scene({
        number: 2,
        title: "Marie rentre à la maison",
        before: "camp",
        presences: [
          physical("Bastien", "camp", "throughout"),
          physical("Lina", "camp", "throughout"),
          physical("Marie", "camp", "start"),
        ],
        movements: [{
          id: "marie-leaves",
          kind: "return_travel",
          from: "camp",
          to: "maison",
          characters: ["Marie"],
          mechanism: "sentier",
          mechanismId: "",
        }],
      }),
      scene({
        number: 3,
        title: "Bastien poursuit avec Lina",
        before: "camp",
        after: "vallée",
        presences: [
          physical("Bastien", "vallée"),
          physical("Lina", "vallée"),
        ],
        movements: [{
          id: "group-to-valley",
          kind: "ordinary_travel",
          from: "camp",
          to: "vallée",
          characters: ["Bastien", "Lina"],
          mechanism: "sentier",
          mechanismId: "",
        }],
      }),
      scene({
        number: 4,
        title: "Marie retrouve le groupe",
        before: "vallée",
        presences: [
          physical("Bastien", "vallée", "throughout"),
          physical("Lina", "vallée", "throughout"),
          physical("Marie", "vallée"),
        ],
      }),
    ],
  };

  const stabilized = stabilizeStoryScenario(scenario);
  assert.deepEqual(stabilized.scenes[1].characterMovements[0].characters, ["Marie"]);
  assert.deepEqual(stabilized.scenes[2].characterMovements[0].characters, ["Bastien", "Lina"]);
  assert.deepEqual(stabilized.scenes[3].characterMovements.map((movement) => ({
    from: movement.from,
    to: movement.to,
    characters: movement.characters,
  })), [{ from: "maison", to: "vallée", characters: ["Marie"] }]);
  const ledger = validateCharacterMovementLedger(stabilized);
  assert.equal(ledger.valid, true);
  assert.deepEqual(ledger.finalLocations, {
    Bastien: "vallée",
    Marie: "vallée",
    Lina: "vallée",
  });
  assert.deepEqual(validateStoryScenario(stabilized), { valid: true, issues: [] });
});

test("a resident may remain at the origin while only part of the cast follows the focal journey", () => {
  const scenario = {
    title: "Le départ",
    summary: "Bastien et Lina partent tandis que Marie reste au camp.",
    characters: [
      { name: "Bastien", initialLocation: "camp" },
      { name: "Marie", initialLocation: "camp" },
      { name: "Lina", initialLocation: "camp" },
    ],
    objects: [],
    scenes: [scene({
      number: 1,
      title: "Bastien et Lina gagnent la vallée",
      before: "camp",
      after: "vallée",
      presences: [
        physical("Bastien", "vallée"),
        physical("Lina", "vallée"),
        physical("Marie", "camp", "start"),
      ],
      movements: [{
        id: "departure",
        kind: "ordinary_travel",
        from: "camp",
        to: "vallée",
        characters: ["Bastien", "Lina"],
        mechanism: "sentier",
        mechanismId: "",
      }],
    })],
  };

  const stabilized = stabilizeStoryScenario(scenario);
  const ledger = validateCharacterMovementLedger(stabilized);
  assert.equal(ledger.valid, true);
  assert.deepEqual(ledger.finalLocations, {
    Bastien: "vallée",
    Marie: "camp",
    Lina: "vallée",
  });
  assert.deepEqual(stabilized.scenes[0].transition.characters, ["Bastien", "Lina"]);
});

test("the ledger rejects a contradictory second move and any nonphysical traveler", () => {
  const scenario = {
    title: "Le trajet impossible",
    summary: "Le registre refuse deux origines contradictoires.",
    characters: [
      { name: "Bastien", initialLocation: "maison" },
      { name: "Marie", initialLocation: "maison" },
    ],
    objects: [],
    scenes: [scene({
      number: 1,
      title: "Deux chemins incompatibles",
      before: "maison",
      after: "forêt",
      presences: [
        physical("Bastien", "forêt"),
        { name: "Marie", mode: "thought", phase: "", location: "", action: "encourage Bastien" },
      ],
      movements: [
        {
          id: "first",
          kind: "ordinary_travel",
          from: "maison",
          to: "parc",
          characters: ["Bastien"],
          mechanism: "chemin",
          mechanismId: "",
        },
        {
          id: "second",
          kind: "ordinary_travel",
          from: "maison",
          to: "forêt",
          characters: ["Bastien", "Marie"],
          mechanism: "chemin",
          mechanismId: "",
        },
      ],
    })],
  };

  const validation = validateCharacterMovementLedger(scenario);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.includes("Bastien cannot depart from maison")));
  assert.ok(validation.issues.some((issue) => issue.includes("Marie cannot travel as a nonphysical presence")));
});

test("arrival inference stays correct across resident and origin-count combinations", () => {
  for (let residentCount = 1; residentCount <= 3; residentCount += 1) {
    for (let originCount = 1; originCount <= 3; originCount += 1) {
      const residents = Array.from({ length: residentCount }, (_, index) => `Résident ${index + 1}`);
      const arrivals = Array.from({ length: originCount }, (_, index) => `Arrivant ${index + 1}`);
      const scenario = {
        title: "Regroupement combinatoire",
        summary: "Chaque arrivant rejoint les résidents depuis sa propre origine.",
        characters: [
          ...residents.map((name) => ({ name, initialLocation: "destination" })),
          ...arrivals.map((name, index) => ({ name, initialLocation: `origine ${index + 1}` })),
        ],
        objects: [],
        scenes: [scene({
          number: 1,
          title: "Tout le monde se retrouve",
          before: "destination",
          presences: [
            ...residents.map((name) => physical(name, "destination", "throughout")),
            ...arrivals.map((name) => physical(name, "destination")),
          ],
        })],
      };

      const stabilized = stabilizeStoryScenario(scenario);
      const movements = stabilized.scenes[0].characterMovements;
      assert.equal(movements.length, originCount);
      assert.deepEqual(movements.flatMap((movement) => movement.characters), arrivals);
      assert.ok(movements.every((movement) => (
        movement.kind === "join_travel"
        && movement.to === "destination"
        && movement.characters.every((name) => !residents.includes(name))
      )));
      assert.equal(validateStoryScenario(stabilized).valid, true);
    }
  }
});

test("every traveling subset leaves non-traveling residents at the origin", () => {
  const cast = ["Bastien", "Marie", "Lina", "Noé"];
  for (let travelingCount = 1; travelingCount < cast.length; travelingCount += 1) {
    const travelers = cast.slice(0, travelingCount);
    const residents = cast.slice(travelingCount);
    const scenario = {
      title: "Départ partiel",
      summary: "Une partie du groupe avance et les autres restent.",
      characters: cast.map((name) => ({ name, initialLocation: "camp" })),
      objects: [],
      scenes: [scene({
        number: 1,
        title: "Le groupe se sépare",
        before: "camp",
        after: "vallée",
        presences: [
          ...travelers.map((name) => physical(name, "vallée")),
          ...residents.map((name) => physical(name, "camp", "start")),
        ],
        movements: [{
          id: "partial-departure",
          kind: "ordinary_travel",
          from: "camp",
          to: "vallée",
          characters: travelers,
          mechanism: "sentier",
          mechanismId: "",
        }],
      })],
    };

    const stabilized = stabilizeStoryScenario(scenario);
    const ledger = validateCharacterMovementLedger(stabilized);
    assert.equal(ledger.valid, true);
    for (const name of travelers) assert.equal(ledger.finalLocations[name], "vallée");
    for (const name of residents) assert.equal(ledger.finalLocations[name], "camp");
    assert.deepEqual(stabilized.scenes[0].transition.characters, travelers);
  }
});
