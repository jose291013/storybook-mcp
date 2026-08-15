import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  NarrativeBookSpecCompileError,
  compileNarrativeBookSpec,
} from "../src/contracts/compileNarrativeBookSpec.js";
import {
  stabilizeStoryScenario,
  withStoryScenarioAuditEvidence,
} from "../src/services/storyScenario.js";
import { precompileStoryScenarioPassageLifecycles } from "../src/services/storyScenarioRepairs.js";
import { validateNarrativeBookSpec } from "../src/contracts/narrativeBookSpec.js";

const schema = JSON.parse(fs.readFileSync(
  new URL("../src/contracts/narrativeBookSpec.v1.schema.json", import.meta.url),
  "utf8",
));
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
  allowUnionTypes: true,
});
addFormats(ajv);
const validateSchema = ajv.compile(schema);

const SAFETY = {
  childSafety: {
    profileVersion: 2,
    category: "general",
    action: "allow",
    restricted: false,
  },
  sensitivity: {
    profileVersion: 2,
    level: 1,
    category: "everyday_challenge",
    restricted: false,
    approach: "light_action_led",
    contractVersion: 1,
    contractDigest: "d".repeat(64),
  },
};

function presence(name, action, {
  mode = "physical",
  phase = "end",
  location = "",
} = {}) {
  return {
    name,
    mode,
    phase: mode === "physical" ? phase : "",
    location: mode === "physical" ? location : "",
    action,
  };
}

function approvedScenario() {
  const scenario = {
    version: 2,
    movementLedgerVersion: 1,
    language: "FR",
    title: "Bastien et la Fleur du lien",
    summary: "Bastien découvre un passage, rencontre une guide et revient avec une fleur.",
    narrativeContract: {
      version: 1,
      privacyMode: "implicit_personal_depth",
      moralDelivery: "action_before_words",
      primarySymbol: {
        name: "Fleur du lien",
        initialMeaning: "un mystère",
        evolvedMeaning: "un lien rassurant",
      },
      secondarySymbols: [],
    },
    clarifications: [],
    creatorClarifications: {},
    worldContract: {},
    characters: [
      {
        name: "Bastien",
        role: "child",
        storyRole: "hero",
        relationship: "hero",
        initialLocation: "le jardin",
        defaultPresenceMode: "physical",
        familyAddress: "",
      },
      {
        name: "Marie",
        role: "mother",
        storyRole: "guide",
        relationship: "mother",
        initialLocation: "le jardin",
        defaultPresenceMode: "physical",
        familyAddress: "Maman",
      },
      {
        name: "Fée de la Forêt",
        role: "story_character",
        storyRole: "guide",
        relationship: "guide",
        initialLocation: "la vallée",
        defaultPresenceMode: "physical",
        familyAddress: "",
      },
    ],
    wardrobePlan: [],
    objects: [
      {
        objectId: "bond_flower",
        name: "Fleur du lien",
        owner: "",
        initialState: "absent",
        trackEveryScene: true,
        causalAuthority: "graph_v1",
        lifecycle: {
          version: 1,
          kind: "discoverable",
          events: [
            {
              sceneNumber: 2,
              type: "introduce",
              state: "visible",
              resultingObject: "",
              resultingState: "visible",
            },
            {
              sceneNumber: 3,
              type: "acquire",
              state: "carried",
              resultingObject: "",
              resultingState: "visible",
            },
          ],
        },
      },
    ],
    causalGraphRequired: true,
    causalGraph: {
      version: 1,
      authority: "architect",
      entities: [
        {
          id: "bond_flower",
          label: "Fleur du lien",
          owner: "",
          initialState: "absent",
        },
      ],
      events: [
        {
          id: "flower_appears",
          sceneNumber: 2,
          type: "introduce",
          entityId: "bond_flower",
          resultEntityId: "",
          fromState: "absent",
          toState: "visible",
          resultState: "visible",
          sequence: 1,
          structurallyValid: true,
        },
        {
          id: "flower_acquired",
          sceneNumber: 3,
          type: "acquire",
          entityId: "bond_flower",
          resultEntityId: "",
          fromState: "visible",
          toState: "carried",
          resultState: "visible",
          sequence: 2,
          structurallyValid: true,
        },
      ],
    },
    scenes: [
      {
        id: "scene-1",
        sceneNumber: 1,
        storyRole: "character_and_desire",
        act: 1,
        title: "La découverte de l'arche",
        locationBefore: "le jardin",
        locationAfter: "le jardin",
        action: "Bastien et Maman observent l'arche lumineuse sans la traverser.",
        purpose: "Découvrir le passage avant de le franchir.",
        narrativeFunction: "Ouvrir la quête",
        dominantEmotion: "Curiosité",
        emotionalShift: "De l'hésitation à l'envie d'explorer",
        storyChange: "Le passage est désormais connu",
        symbolUse: [],
        prerequisiteSceneIds: [],
        characterPresences: [
          presence("Bastien", "observe l'arche", { phase: "throughout", location: "le jardin" }),
          presence("Marie", "reste près de Bastien", { phase: "throughout", location: "le jardin" }),
        ],
        transition: {
          kind: "discover_passage",
          mechanism: "l'arche lumineuse",
          mechanismId: "garden_arch",
          from: "le jardin",
          to: "le jardin",
          characters: ["Bastien", "Marie"],
        },
        characterMovements: [],
        objectStates: [
          {
            objectId: "bond_flower",
            name: "Fleur du lien",
            owner: "",
            state: "absent",
            quantity: 1,
            instruction: "La fleur n'est pas encore visible.",
          },
        ],
        continuityToNext: "L'arche pourra être traversée.",
      },
      {
        id: "scene-2",
        sceneNumber: 2,
        storyRole: "climax",
        act: 2,
        title: "La Fleur du lien",
        locationBefore: "le jardin",
        locationAfter: "la vallée",
        action: "Après la traversée, la Fée montre à Bastien et Maman la Fleur du lien.",
        purpose: "Faire vivre la découverte.",
        narrativeFunction: "Révéler le symbole",
        dominantEmotion: "Émerveillement",
        emotionalShift: "De la curiosité à la confiance",
        storyChange: "La fleur apparaît",
        symbolUse: [{ name: "Fleur du lien", role: "symbole rassurant" }],
        prerequisiteSceneIds: ["scene-1"],
        characterPresences: [
          presence("Bastien", "regarde la Fleur du lien", { location: "la vallée" }),
          presence("Marie", "observe avec Bastien", { location: "la vallée" }),
          presence("Fée de la Forêt", "montre la Fleur du lien", { phase: "throughout", location: "la vallée" }),
        ],
        transition: {
          kind: "cross_passage",
          mechanism: "l'arche lumineuse",
          mechanismId: "garden_arch",
          from: "le jardin",
          to: "la vallée",
          characters: ["Bastien", "Marie"],
        },
        characterMovements: [
          {
            id: "movement-1",
            kind: "cross_passage",
            from: "le jardin",
            to: "la vallée",
            characters: ["Bastien", "Marie"],
            mechanism: "l'arche lumineuse",
            mechanismId: "garden_arch",
          },
        ],
        objectStates: [
          {
            objectId: "bond_flower",
            name: "Fleur du lien",
            owner: "",
            state: "visible",
            quantity: 1,
            instruction: "Une seule fleur est visible.",
          },
        ],
        continuityToNext: "Bastien pourra rapporter la fleur.",
      },
      {
        id: "scene-3",
        sceneNumber: 3,
        storyRole: "return_home_and_moral",
        act: 3,
        title: "Le retour au jardin",
        locationBefore: "la vallée",
        locationAfter: "le jardin",
        action: "Bastien et Maman retraversent l'arche et reviennent seuls dans le jardin.",
        purpose: "Montrer la transformation de Bastien.",
        narrativeFunction: "Fermer la quête",
        dominantEmotion: "Sérénité",
        emotionalShift: "De l'émerveillement à l'apaisement",
        storyChange: "Bastien rapporte la fleur",
        symbolUse: [{ name: "Fleur du lien", role: "symbole compris" }],
        prerequisiteSceneIds: ["scene-2"],
        characterPresences: [
          presence("Bastien", "porte la Fleur du lien", { location: "le jardin" }),
          presence("Marie", "marche près de Bastien", { location: "le jardin" }),
          presence("Fée de la Forêt", "Bastien se souvient de son conseil", { mode: "memory" }),
        ],
        transition: {
          kind: "return_travel",
          mechanism: "l'arche lumineuse",
          mechanismId: "garden_arch",
          from: "la vallée",
          to: "le jardin",
          characters: ["Bastien", "Marie"],
        },
        characterMovements: [
          {
            id: "movement-1",
            kind: "return_travel",
            from: "la vallée",
            to: "le jardin",
            characters: ["Bastien", "Marie"],
            mechanism: "l'arche lumineuse",
            mechanismId: "garden_arch",
          },
        ],
        objectStates: [
          {
            objectId: "bond_flower",
            name: "Fleur du lien",
            owner: "Bastien",
            state: "carried",
            quantity: 1,
            instruction: "Bastien porte l'unique fleur.",
          },
        ],
        continuityToNext: "La Fée reste dans la vallée.",
      },
    ],
  };
  const returnScene = scenario.scenes.pop();
  for (let sceneNumber = 3; sceneNumber <= 10; sceneNumber += 1) {
    scenario.scenes.push({
      id: `scene-${sceneNumber}`,
      sceneNumber,
      storyRole: `progression_${sceneNumber}`,
      act: sceneNumber < 7 ? 2 : 3,
      title: `Une étape dans la vallée ${sceneNumber}`,
      locationBefore: "la vallée",
      locationAfter: "la vallée",
      action: `Bastien avance avec Maman et la Fée dans la vallée, étape ${sceneNumber}.`,
      purpose: `Faire progresser la quête à l'étape ${sceneNumber}.`,
      narrativeFunction: `Progression narrative ${sceneNumber}`,
      dominantEmotion: "Confiance",
      emotionalShift: `De l'étape ${sceneNumber - 1} à l'étape ${sceneNumber}`,
      storyChange: `La quête progresse à l'étape ${sceneNumber}`,
      symbolUse: [{ name: "Fleur du lien", role: `repère ${sceneNumber}` }],
      prerequisiteSceneIds: [`scene-${sceneNumber - 1}`],
      characterPresences: [
        presence("Bastien", `observe la Fleur du lien à l'étape ${sceneNumber}`, { phase: "throughout", location: "la vallée" }),
        presence("Marie", `accompagne Bastien à l'étape ${sceneNumber}`, { phase: "throughout", location: "la vallée" }),
        presence("Fée de la Forêt", `guide le groupe à l'étape ${sceneNumber}`, { phase: "throughout", location: "la vallée" }),
      ],
      transition: {
        kind: "none",
        mechanism: "",
        mechanismId: "",
        from: "la vallée",
        to: "la vallée",
        characters: [],
      },
      characterMovements: [],
      objectStates: [
        {
          objectId: "bond_flower",
          name: "Fleur du lien",
          owner: "",
          state: "visible",
          quantity: 1,
          instruction: "Une seule fleur reste visible.",
        },
      ],
      continuityToNext: `Continuer après l'étape ${sceneNumber}.`,
    });
  }
  returnScene.id = "scene-11";
  returnScene.sceneNumber = 11;
  returnScene.prerequisiteSceneIds = ["scene-10"];
  scenario.scenes.push(returnScene);
  scenario.objects[0].lifecycle.events[1].sceneNumber = 11;
  scenario.causalGraph.events[1].sceneNumber = 11;
  const audited = withStoryScenarioAuditEvidence(scenario, {
    auditedAt: "2026-07-30T12:00:00.000Z",
  });
  return {
    ...audited,
    status: "approved",
    revision: 1,
    approvedAt: "2026-07-30T12:01:00.000Z",
  };
}

function compile(overrides = {}) {
  return compileNarrativeBookSpec({
    projectId: "project-compiler-test",
    scenario: approvedScenario(),
    book: {
      language: "FR",
      audienceAge: 8,
      pageCount: 24,
      universeId: "dinosaur_valley",
    },
    safety: SAFETY,
    ...overrides,
  });
}

function approveAgain(scenario, revision = 2) {
  delete scenario.auditEvidence;
  delete scenario.status;
  delete scenario.revision;
  delete scenario.approvedAt;
  const audited = withStoryScenarioAuditEvidence(scenario, {
    auditedAt: "2026-07-30T13:00:00.000Z",
  });
  return {
    ...audited,
    status: "approved",
    revision,
    approvedAt: "2026-07-30T13:01:00.000Z",
  };
}

test("compiler deterministically produces a mechanically valid pending contract", () => {
  const first = compile();
  const second = compile();
  const validation = validateNarrativeBookSpec(first);

  assert.deepEqual(first, second);
  assert.equal(validation.valid, true, JSON.stringify(validation.issues, null, 2));
  assert.equal(first.validation.semanticAudit.status, "pending");
  assert.equal(first.validation.semanticAudit.auditedAt, null);
  assert.equal(first.validation.artifactDigest, second.validation.artifactDigest);
  assert.equal(validateSchema(first), true, JSON.stringify(validateSchema.errors, null, 2));
});

test("movement canonicalizer defaults off and observe leaves the compiled contract unchanged", () => {
  const baseline = compile({ movementCanonicalizerMode: "off" });
  const observed = compile({ movementCanonicalizerMode: "observe" });
  assert.deepEqual(observed, baseline);
});

test("movement canonicalizer enforce repairs a stale hidden origin without changing source evidence", () => {
  const scenario = structuredClone(approvedScenario());
  scenario.scenes[1].characterMovements[0].from = "ancien jardin";
  scenario.scenes[1].transition.from = "ancien jardin";
  const approved = approveAgain(scenario);
  assert.throws(() => compile({ scenario: approved, movementCanonicalizerMode: "off" }), (error) => (
    error instanceof NarrativeBookSpecCompileError
  ));

  const contract = compile({ scenario: approved, movementCanonicalizerMode: "enforce" });
  assert.equal(validateNarrativeBookSpec(contract).valid, true);
  assert.equal(contract.scenes[1].movements[0].fromLocationId, contract.scenes[1].timeline.locationBeforeId);
  assert.equal(contract.sourceScenario.digest, approved.auditEvidence.digest);
  assert.equal(approved.scenes[1].characterMovements[0].from, "ancien jardin");
});

test("movement canonicalizer observe emits only bounded counters and scene coordinates", () => {
  const scenario = structuredClone(approvedScenario());
  scenario.scenes[1].characterMovements[0].from = "ancien jardin";
  scenario.scenes[1].transition.from = "ancien jardin";
  const approved = approveAgain(scenario);
  const messages = [];
  const original = console.info;
  console.info = (...parts) => messages.push(parts.join(" "));
  try {
    assert.throws(() => compile({ scenario: approved, movementCanonicalizerMode: "observe" }));
  } finally {
    console.info = original;
  }
  assert.equal(messages.length, 1);
  assert.match(messages[0], /narrative-movement-canonicalizer/);
  assert.match(messages[0], /"repairedOrigins":2/);
  assert.doesNotMatch(messages[0], /Bastien|Marie|ancien jardin/);
});

test("compiler binds the approved passage discovery, crossing and return without AI", () => {
  const contract = compile();

  assert.equal(contract.registries.passages.length, 1);
  assert.equal(contract.scenes[0].movements[0].kind, "discover_passage");
  assert.equal(contract.scenes[1].movements[0].kind, "cross_passage");
  assert.equal(contract.scenes[10].movements[0].kind, "return_travel");
  assert.equal(contract.scenes[10].illustration.visibleCharacterIds.includes("fee_de_la_foret"), false);
  assert.deepEqual(contract.scenes[10].illustration.evokedCharacterIds, ["fee_de_la_foret"]);
});

test("compiler accepts an ordered arrival then passage discovery in the same scene", () => {
  const scenario = approvedScenario();
  scenario.characters[0].initialLocation = "la maison";
  scenario.characters[1].initialLocation = "la maison";
  scenario.scenes[0].locationBefore = "la maison";
  scenario.scenes[0].action = "Bastien et Maman arrivent dans le jardin et découvrent l'arche lumineuse.";
  scenario.scenes[0].characterPresences = scenario.scenes[0].characterPresences.map((entry) => ({
    ...entry,
    phase: "end",
    location: "le jardin",
  }));
  scenario.scenes[0].transition = {
    kind: "ordinary_travel",
    mechanism: "le chemin",
    mechanismId: "",
    from: "la maison",
    to: "le jardin",
    characters: ["Bastien", "Marie"],
  };
  scenario.scenes[0].characterMovements = [
    {
      id: "movement-1",
      ...scenario.scenes[0].transition,
    },
    {
      id: "movement-2",
      kind: "discover_passage",
      mechanism: "l'arche lumineuse",
      mechanismId: "garden_arch",
      from: "le jardin",
      to: "le jardin",
      characters: ["Bastien", "Marie"],
    },
  ];

  const contract = compile({ scenario: approveAgain(scenario) });

  assert.deepEqual(contract.scenes[0].movements.map((movement) => movement.kind), [
    "ordinary_travel",
    "discover_passage",
  ]);
  assert.equal(validateNarrativeBookSpec(contract).valid, true);
});

test("a missing passage discovery points to the first crossing scene", () => {
  const scenario = approvedScenario();
  scenario.scenes[0].transition = {
    kind: "none",
    mechanism: "",
    mechanismId: "",
    from: scenario.scenes[0].locationBefore,
    to: scenario.scenes[0].locationAfter,
    characters: [],
  };
  scenario.scenes[0].characterMovements = [];

  let failure = null;
  try {
    compile({ scenario: approveAgain(scenario) });
  } catch (error) {
    failure = error;
  }

  assert.ok(failure instanceof NarrativeBookSpecCompileError);
  const issue = failure.issues.find((candidate) => candidate.code === "passage_discovery_missing");
  assert.equal(issue?.path, "scenes[1].transition");
});

test("passage precompilation removes a stale transition endpoint before canonical compilation", () => {
  const scenario = approvedScenario();
  scenario.scenes[1].transition.to = "ancienne plage erronée";
  assert.throws(() => compile({ scenario: approveAgain(scenario) }), (error) => (
    error instanceof NarrativeBookSpecCompileError
    && error.issues.some((issue) => issue.code === "ambiguous_passage_endpoints")
  ));

  const precompiled = precompileStoryScenarioPassageLifecycles(scenario, { language: "FR" });
  const contract = compile({ scenario: approveAgain(precompiled) });
  assert.equal(contract.registries.passages.length, 1);
  assert.equal(validateNarrativeBookSpec(contract).valid, true);
});

test("passage precompilation compiles a crossing whose route coordinates were omitted", () => {
  const scenario = approvedScenario();
  scenario.scenes[1].transition.from = "";
  scenario.scenes[1].transition.to = "";
  scenario.scenes[1].characterMovements = scenario.scenes[1].characterMovements.map((movement) => ({
    ...movement,
    from: "",
    to: "",
  }));

  const precompiled = precompileStoryScenarioPassageLifecycles(scenario, { language: "FR" });
  const contract = compile({ scenario: approveAgain(precompiled) });
  assert.equal(contract.registries.passages.length, 1);
  assert.equal(validateNarrativeBookSpec(contract).valid, true);
});

test("physical chronology precompilation compiles an approach, passage crossing and multi-leg return", () => {
  const scenario = approvedScenario();
  for (const character of scenario.characters.filter(({ name }) => ["Bastien", "Marie"].includes(name))) {
    character.initialLocation = "la maison";
  }
  const discovery = scenario.scenes[0];
  discovery.locationBefore = "la maison";
  discovery.locationAfter = "le jardin";
  discovery.characterPresences = discovery.characterPresences.map((entry) => ({
    ...entry,
    phase: "end",
    location: "le jardin",
  }));
  discovery.characterMovements = [{
    id: "movement-1",
    kind: "ordinary_travel",
    mechanism: "le chemin de la maison",
    mechanismId: "home_path",
    from: "la maison",
    to: "le jardin",
    characters: ["Bastien", "Marie"],
  }, {
    id: "movement-2",
    ...discovery.transition,
  }];

  const returning = scenario.scenes.at(-1);
  returning.locationAfter = "la maison";
  returning.characterPresences = returning.characterPresences.map((entry) => (
    entry.mode === "physical" ? { ...entry, location: "la maison" } : entry
  ));
  returning.transition.to = "la maison";
  returning.characterMovements[0].to = "la maison";

  const precompiled = precompileStoryScenarioPassageLifecycles(scenario, { language: "FR" });
  assert.equal(precompiled.scenes[0].transition.kind, "ordinary_travel");
  assert.deepEqual(precompiled.scenes[0].characterMovements.map(({ kind }) => kind), [
    "ordinary_travel",
    "discover_passage",
  ]);
  assert.deepEqual(precompiled.scenes.at(-1).characterMovements.map(({ kind, from, to }) => ({
    kind,
    from,
    to,
  })), [{
    kind: "return_travel",
    from: "la vallée",
    to: "le jardin",
  }, {
    kind: "ordinary_travel",
    from: "le jardin",
    to: "la maison",
  }]);

  const contract = compile({ scenario: approveAgain(precompiled) });
  assert.equal(validateNarrativeBookSpec(contract).valid, true);
  assert.deepEqual(contract.scenes[0].movements.map(({ kind }) => kind), [
    "ordinary_travel",
    "discover_passage",
  ]);
  assert.deepEqual(contract.scenes.at(-1).movements.map(({ kind }) => kind), [
    "return_travel",
    "ordinary_travel",
  ]);
});

test("ambiguous passage diagnostics point to the crossing that introduces a third endpoint", () => {
  const scenario = approvedScenario();
  scenario.scenes.at(-1).locationAfter = "la maison";
  scenario.scenes.at(-1).transition.to = "la maison";
  scenario.scenes.at(-1).characterMovements[0].to = "la maison";

  assert.throws(() => compile({ scenario: approveAgain(scenario) }), (error) => {
    const issue = error instanceof NarrativeBookSpecCompileError
      ? error.issues.find((entry) => entry.code === "ambiguous_passage_endpoints")
      : null;
    return issue?.path === "scenes[10].transition";
  });
});

test("compiler derives a start-only illustration phase without asking the model to rewrite it", () => {
  const scenario = approvedScenario();
  scenario.scenes[0].characterPresences = scenario.scenes[0].characterPresences.map((entry) => ({
    ...entry,
    phase: "start",
  }));

  const contract = compile({ scenario: approveAgain(scenario) });

  assert.equal(contract.scenes[0].timeline.visiblePhase, "start");
  assert.deepEqual(contract.scenes[0].illustration.visibleCharacterIds, ["bastien", "marie"]);
  assert.equal(validateNarrativeBookSpec(contract).valid, true);
});

test("compiler derives a missing presence action from the approved scene action", () => {
  const scenario = approvedScenario();
  scenario.scenes[0].characterPresences[0].action = "";

  const contract = compile({ scenario: approveAgain(scenario) });

  assert.equal(contract.scenes[0].presences[0].action, scenario.scenes[0].action);
  assert.equal(validateNarrativeBookSpec(contract).valid, true);
});

test("compiler resolves a stable character id and its display-name aliases to one registry entry", () => {
  const scenario = approvedScenario();
  scenario.characters[0].id = "hero_bastien";
  const contract = compile({ scenario: approveAgain(scenario) });
  const hero = contract.registries.characters.find((character) => (
    character.canonicalName === "Bastien"
  ));

  assert.equal(hero.id, "hero_bastien");
  assert.equal(contract.scenes[0].presences[0].characterId, "hero_bastien");
  assert.equal(contract.scenes[10].objectStates[0].ownerCharacterId, "hero_bastien");
  assert.equal(validateNarrativeBookSpec(contract).valid, true);
});

test("compiler normalizes a reversed ordinary route without inventing a passage", () => {
  const scenario = approvedScenario();
  const outbound = scenario.scenes[4];
  outbound.locationBefore = "la vallée";
  outbound.locationAfter = "la clairière";
  outbound.action = "Bastien, Maman et la Fée marchent de la vallée à la clairière.";
  outbound.characterPresences = [
    presence("Bastien", "arrive dans la clairière", { location: "la clairière" }),
    presence("Marie", "arrive avec Bastien", { location: "la clairière" }),
    presence("Fée de la Forêt", "accompagne le groupe", { location: "la clairière" }),
  ];
  outbound.transition = {
    kind: "ordinary_travel",
    mechanism: "sentier forestier",
    mechanismId: "forest_path",
    from: "la vallée",
    to: "la clairière",
    characters: ["Bastien", "Marie", "Fée de la Forêt"],
  };
  outbound.characterMovements = [{
    id: "outbound-walk",
    ...outbound.transition,
  }];

  const returning = scenario.scenes[5];
  returning.locationBefore = "la clairière";
  returning.locationAfter = "la vallée";
  returning.action = "Bastien, Maman et la Fée reprennent le sentier vers la vallée.";
  returning.characterPresences = [
    presence("Bastien", "revient dans la vallée", { location: "la vallée" }),
    presence("Marie", "revient avec Bastien", { location: "la vallée" }),
    presence("Fée de la Forêt", "ramène le groupe", { location: "la vallée" }),
  ];
  returning.transition = {
    kind: "return_travel",
    mechanism: "sentier forestier",
    mechanismId: "forest_path",
    from: "la clairière",
    to: "la vallée",
    characters: ["Bastien", "Marie", "Fée de la Forêt"],
  };
  returning.characterMovements = [{
    id: "return-walk",
    ...returning.transition,
  }];

  const contract = compile({ scenario: approveAgain(scenario) });

  assert.deepEqual(contract.registries.passages.map(({ id }) => id), ["garden_arch"]);
  assert.equal(contract.scenes[4].movements[0].kind, "ordinary_travel");
  assert.equal(contract.scenes[5].movements[0].kind, "ordinary_travel");
  assert.equal(contract.scenes[5].movements[0].passageId, null);
  assert.equal(contract.scenes[5].transition.kind, "ordinary_travel");
  assert.equal(contract.scenes[5].transition.passageId, null);
  assert.equal(contract.scenes[10].movements[0].kind, "return_travel");
  assert.equal(contract.scenes[10].movements[0].passageId, "garden_arch");
  assert.equal(validateNarrativeBookSpec(contract).valid, true);
});

test("compiler makes every tracked object state explicit on every scene", () => {
  const contract = compile();
  const states = [
    contract.scenes[0].objectStates[0],
    contract.scenes[1].objectStates[0],
    contract.scenes[10].objectStates[0],
  ];

  assert.deepEqual(states.map(({ state }) => state), ["absent", "visible", "carried"]);
  assert.deepEqual(states.map(({ quantity }) => quantity), [0, 1, 1]);
  assert.equal(states[0].eventId, null);
  assert.equal(states[1].eventId, "flower_appears");
  assert.equal(states[2].eventId, "flower_acquired");
  assert.equal(states[2].ownerCharacterId, "bastien");
});

test("compiler consumes the deterministic version-2 object ledger instead of model scene snapshots", () => {
  const scenario = approvedScenario();
  scenario.causalGraph.version = 2;
  scenario.causalGraph.authority = "draft_v2";
  scenario.causalGraph.entities[0] = {
    id: "bond_flower",
    label: "Fleur du lien",
    initialState: "absent",
    initialOwnerCharacter: "",
    initialQuantity: 0,
  };
  scenario.causalGraph.events[0] = {
    ...scenario.causalGraph.events[0],
    fromState: "",
    toOwnerCharacter: "",
    toQuantity: 1,
    resultOwnerCharacter: "",
    resultQuantity: 1,
  };
  scenario.causalGraph.events[1] = {
    ...scenario.causalGraph.events[1],
    fromState: "",
    toOwnerCharacter: "Bastien",
    toQuantity: 1,
    resultOwnerCharacter: "",
    resultQuantity: 1,
  };
  for (const scene of scenario.scenes) {
    scene.objectStates = [{
      objectId: "bond_flower",
      name: "Fleur du lien",
      owner: "Marie",
      state: "held",
      quantity: 9,
      instruction: "Contradictory model snapshot that must be ignored.",
    }];
  }

  const stabilized = stabilizeStoryScenario(scenario);
  const contract = compile({ scenario: approveAgain(stabilized) });
  const states = [
    contract.scenes[0].objectStates[0],
    contract.scenes[1].objectStates[0],
    contract.scenes[10].objectStates[0],
  ];

  assert.deepEqual(states.map(({ state }) => state), ["absent", "visible", "carried"]);
  assert.deepEqual(states.map(({ quantity }) => quantity), [0, 1, 1]);
  assert.equal(states[2].ownerCharacterId, "bastien");
  assert.equal(validateNarrativeBookSpec(contract).valid, true);
});

test("compiler applies several ordered version-2 changes for one object in the same scene", () => {
  const scenario = approvedScenario();
  scenario.causalGraph.version = 2;
  scenario.causalGraph.authority = "draft_v2";
  scenario.causalGraph.entities[0] = {
    id: "bond_flower",
    label: "Fleur du lien",
    initialState: "absent",
    initialOwnerCharacter: "",
    initialQuantity: 0,
    spatialMode: "portable",
    homeLocation: "",
    progressTotal: 0,
    initialProgress: 0,
  };
  scenario.causalGraph.events[0] = {
    ...scenario.causalGraph.events[0],
    toOwnerCharacter: "",
    toQuantity: 1,
  };
  scenario.causalGraph.events[1] = {
    ...scenario.causalGraph.events[1],
    toOwnerCharacter: "Bastien",
    toQuantity: 1,
  };
  scenario.objects.push({
    objectId: "special_light",
    name: "Lumiere speciale",
    owner: "",
    initialState: "installed",
    initialQuantity: 1,
    trackEveryScene: true,
    spatialMode: "portable",
    progressTotal: 0,
    causalAuthority: "graph_v2",
    lifecycle: { version: 1, kind: "persistent", events: [] },
  });
  scenario.causalGraph.entities.push({
    id: "special_light",
    label: "Lumiere speciale",
    initialState: "installed",
    initialOwnerCharacter: "",
    initialQuantity: 1,
    spatialMode: "portable",
    homeLocation: "",
    progressTotal: 0,
    initialProgress: 0,
  });
  scenario.causalGraph.events.push({
    id: "light_retrieved",
    sceneNumber: 3,
    type: "retrieve",
    entityId: "special_light",
    resultEntityId: "",
    fromState: "installed",
    toState: "held",
    toOwnerCharacter: "Bastien",
    toQuantity: 1,
    resultState: "visible",
    resultOwnerCharacter: "",
    resultQuantity: 1,
    progressStep: 0,
    sequence: 3,
    structurallyValid: true,
  }, {
    id: "light_installed",
    sceneNumber: 3,
    type: "install",
    entityId: "special_light",
    resultEntityId: "",
    fromState: "held",
    toState: "installed",
    toOwnerCharacter: "",
    toQuantity: 1,
    resultState: "visible",
    resultOwnerCharacter: "",
    resultQuantity: 1,
    progressStep: 0,
    sequence: 4,
    structurallyValid: true,
  });
  scenario.scenes[2].action = "Bastien retire la lumiere de son premier support puis la fixe sur le second.";

  const stabilized = stabilizeStoryScenario(scenario);
  const contract = compile({ scenario: approveAgain(stabilized) });
  const lightEvents = contract.registries.causalEvents.filter(({ objectId }) => objectId === "special_light");
  const sceneThreeState = contract.scenes[2].objectStates.find(({ objectId }) => objectId === "special_light");

  assert.deepEqual(lightEvents.map(({ id }) => id), ["light_retrieved", "light_installed"]);
  assert.deepEqual(lightEvents.map(({ fromState, toState }) => [fromState, toState]), [
    ["installed", "held"],
    ["held", "installed"],
  ]);
  assert.deepEqual(lightEvents.map(({ sequence }) => sequence), [3, 4]);
  assert.equal(sceneThreeState.state, "installed");
  assert.equal(sceneThreeState.ownerCharacterId, null);
  assert.equal(sceneThreeState.eventId, "light_installed");
  assert.equal(validateNarrativeBookSpec(contract).valid, true);
});

test("compiler does not turn a non-character object attribution into a character owner", () => {
  const scenario = approvedScenario();
  scenario.objects.push({
    objectId: "shared_workbench",
    name: "Établi partagé",
    owner: "atelier collectif",
    initialState: "visible",
    trackEveryScene: true,
    causalAuthority: "graph_v1",
    lifecycle: {
      version: 1,
      kind: "persistent",
      events: [],
    },
  });
  scenario.causalGraph.entities.push({
    id: "shared_workbench",
    label: "Établi partagé",
    owner: "atelier collectif",
    initialState: "visible",
  });
  for (const scene of scenario.scenes) {
    scene.objectStates.push({
      objectId: "shared_workbench",
      name: "Établi partagé",
      owner: "atelier collectif",
      state: "visible",
      quantity: 1,
      instruction: "L'établi reste visible dans l'atelier.",
    });
  }

  const contract = compile({ scenario: approveAgain(scenario) });
  const workbench = contract.registries.objects.find(({ id }) => id === "shared_workbench");

  assert.equal(workbench.initialOwnerCharacterId, null);
  assert.equal(contract.scenes.every((scene) => (
    scene.objectStates.find(({ objectId }) => objectId === "shared_workbench")
      ?.ownerCharacterId === null
  )), true);
  assert.equal(validateNarrativeBookSpec(contract).valid, true);
});

test("compiler derives a fixed fixture visibility from its home location", () => {
  const scenario = approvedScenario();
  const homeLocation = scenario.scenes[0].locationAfter;
  scenario.objects.push({
    objectId: "fixed_lighthouse",
    name: "Phare fixe",
    owner: "",
    initialState: "visible",
    trackEveryScene: true,
    spatialMode: "location_bound",
    homeLocation,
    causalAuthority: "graph_v2",
    lifecycle: { version: 1, kind: "persistent", events: [] },
  });
  scenario.causalGraph.entities.push({
    id: "fixed_lighthouse",
    label: "Phare fixe",
    initialState: "visible",
    initialOwnerCharacter: "",
    initialQuantity: 1,
    spatialMode: "location_bound",
    homeLocation,
    progressTotal: 0,
    initialProgress: 0,
  });
  for (const scene of scenario.scenes) {
    scene.objectStates.push({
      objectId: "fixed_lighthouse",
      name: "Phare fixe",
      owner: "",
      state: "visible",
      quantity: 1,
      instruction: "Contradictory model visibility must be replaced by location projection.",
    });
  }

  const stabilized = stabilizeStoryScenario(scenario);
  const contract = compile({ scenario: approveAgain(stabilized) });
  const states = contract.scenes.map((scene, index) => ({
    state: scene.objectStates.find(({ objectId }) => objectId === "fixed_lighthouse")?.state,
    expected: scenario.scenes[index].locationAfter === homeLocation ? "visible" : "absent",
  }));

  assert.equal(states.every(({ state, expected }) => state === expected), true);
  assert.equal(validateNarrativeBookSpec(contract).valid, true);
});

test("compiler preserves bounded progressive work without repeating object installation", () => {
  const scenario = approvedScenario();
  scenario.causalGraph.version = 2;
  scenario.objects[0].causalAuthority = "graph_v2";
  scenario.causalGraph.entities[0].initialQuantity = 0;
  scenario.causalGraph.events[0].toQuantity = 1;
  scenario.causalGraph.events[1].toQuantity = 1;
  scenario.causalGraph.events[1].toOwnerCharacter = "Bastien";
  scenario.objects.push({
    objectId: "progressive_mural",
    name: "Fresque progressive",
    owner: "",
    initialState: "installed",
    trackEveryScene: true,
    spatialMode: "portable",
    progressTotal: 2,
    causalAuthority: "graph_v2",
    lifecycle: { version: 1, kind: "persistent", events: [] },
  });
  scenario.causalGraph.entities.push({
    id: "progressive_mural",
    label: "Fresque progressive",
    initialState: "installed",
    initialOwnerCharacter: "",
    initialQuantity: 1,
    spatialMode: "portable",
    progressTotal: 2,
    initialProgress: 0,
  });
  scenario.causalGraph.events.push(
    {
      id: "mural_step_1", sceneNumber: 2, type: "use", entityId: "progressive_mural",
      fromState: "installed", toState: "installed", toQuantity: 1, progressStep: 1,
      sequence: 3, structurallyValid: true,
    },
    {
      id: "mural_step_2", sceneNumber: 3, type: "use", entityId: "progressive_mural",
      fromState: "installed", toState: "installed", toQuantity: 1, progressStep: 2,
      sequence: 4, structurallyValid: true,
    },
  );
  for (const scene of scenario.scenes) {
    scene.objectStates.push({
      objectId: "progressive_mural",
      name: "Fresque progressive",
      owner: "",
      state: "installed",
      quantity: 1,
    });
  }

  const stabilized = stabilizeStoryScenario(scenario);
  const contract = compile({ scenario: approveAgain(stabilized) });
  const mural = contract.registries.objects.find(({ id }) => id === "progressive_mural");
  const muralEvents = contract.registries.causalEvents.filter(({ objectId }) => objectId === mural.id);
  const progress = contract.scenes.slice(0, 3).map((scene) => (
    scene.objectStates.find(({ objectId }) => objectId === mural.id)?.progress
  ));

  assert.equal(mural.progressTotal, 2);
  assert.deepEqual(muralEvents.map(({ type }) => type), ["use", "use"]);
  assert.deepEqual(muralEvents.map(({ toProgress }) => toProgress), [1, 2]);
  assert.deepEqual(progress, [0, 1, 2]);
  assert.equal(validateNarrativeBookSpec(contract).valid, true);
});

test("compiler still rejects a possessed object attributed to an unknown character", () => {
  const scenario = approvedScenario();
  scenario.scenes[10].objectStates[0] = {
    ...scenario.scenes[10].objectStates[0],
    owner: "le groupe",
    state: "carried",
  };

  assert.throws(
    () => compile({ scenario: approveAgain(scenario) }),
    (error) => (
      error instanceof NarrativeBookSpecCompileError
      && error.issues.some((issue) => (
        issue.code === "unknown_character"
        && issue.path === "scenes[10].objectStates[0].ownerCharacterId"
      ))
      && error.issues.some((issue) => (
        issue.code === "possessed_object_owner_required"
        && issue.path === "scenes[10].objectStates[0].ownerCharacterId"
      ))
    ),
  );
});

test("compiler rejects an unapproved scenario", () => {
  const scenario = approvedScenario();
  scenario.status = "proposed";

  assert.throws(
    () => compile({ scenario }),
    (error) => (
      error instanceof NarrativeBookSpecCompileError
      && error.issues.some((issue) => issue.code === "scenario_not_approved")
    ),
  );
});

test("compiler rejects stale final audit evidence", () => {
  const scenario = approvedScenario();
  scenario.scenes[0].action = "Texte modifié après l'audit.";

  assert.throws(
    () => compile({ scenario }),
    (error) => (
      error instanceof NarrativeBookSpecCompileError
      && error.issues.some((issue) => issue.code === "stale_scenario_audit")
    ),
  );
});

test("compiler rejects a silent object ownership change instead of repairing it", () => {
  const scenario = approvedScenario();
  scenario.scenes[0].objectStates[0] = {
    ...scenario.scenes[0].objectStates[0],
    state: "carried",
    owner: "Bastien",
  };
  const audited = withStoryScenarioAuditEvidence(scenario, {
    auditedAt: "2026-07-30T12:02:00.000Z",
  });
  audited.status = "approved";
  audited.revision = 2;
  audited.approvedAt = "2026-07-30T12:03:00.000Z";

  assert.throws(
    () => compile({ scenario: audited }),
    (error) => (
      error instanceof NarrativeBookSpecCompileError
      && error.issues.some((issue) => [
        "invalid_approved_scenario",
        "object_changed_without_causal_event",
      ].includes(issue.code))
    ),
  );
});

test("compiler rejects legacy scenarios without movement and causal ledgers", () => {
  const scenario = approvedScenario();
  delete scenario.movementLedgerVersion;
  delete scenario.causalGraph;
  delete scenario.auditEvidence;

  assert.throws(
    () => compile({ scenario }),
    (error) => (
      error instanceof NarrativeBookSpecCompileError
      && error.issues.some((issue) => issue.code === "movement_ledger_required")
      && error.issues.some((issue) => issue.code === "causal_graph_required")
    ),
  );
});

test("compiler projects one approved transformation into source and result causal events", () => {
  const scenario = approvedScenario();
  const flower = scenario.objects[0];
  flower.lifecycle.kind = "transformable";
  flower.lifecycle.events[1] = {
    sceneNumber: 11,
    type: "transform",
    state: "transformed",
    resultingObject: "Pétale souvenir",
    resultingState: "visible",
  };
  scenario.objects.push({
    objectId: "memory_petal",
    name: "Pétale souvenir",
    owner: "",
    initialState: "absent",
    trackEveryScene: true,
    causalAuthority: "graph_v1",
    lifecycle: {
      version: 1,
      kind: "persistent",
      events: [],
    },
  });
  scenario.causalGraph.entities.push({
    id: "memory_petal",
    label: "Pétale souvenir",
    owner: "",
    initialState: "absent",
  });
  scenario.causalGraph.events[1] = {
    id: "flower_transforms",
    sceneNumber: 11,
    type: "transform",
    entityId: "bond_flower",
    resultEntityId: "memory_petal",
    fromState: "visible",
    toState: "transformed",
    resultState: "visible",
    sequence: 2,
    structurallyValid: true,
  };
  for (const scene of scenario.scenes) {
    scene.objectStates.push({
      objectId: "memory_petal",
      name: "Pétale souvenir",
      owner: "",
      state: scene.sceneNumber === 11 ? "visible" : "absent",
      quantity: 1,
      instruction: scene.sceneNumber === 11
        ? "Un pétale apparaît après la transformation."
        : "Le pétale n'existe pas encore.",
    });
  }
  scenario.scenes[10].objectStates[0] = {
    ...scenario.scenes[10].objectStates[0],
    owner: "",
    state: "transformed",
  };
  const contract = compile({ scenario: approveAgain(scenario) });
  const source = contract.registries.causalEvents.find((event) => event.id === "flower_transforms");
  const result = contract.registries.causalEvents.find((event) => event.id === "flower_transforms_result");

  assert.equal(source.resultObjectId, "memory_petal");
  assert.equal(source.toState, "transformed");
  assert.equal(result.type, "introduce");
  assert.equal(result.objectId, "memory_petal");
  assert.equal(result.fromState, "absent");
  assert.equal(result.toState, "visible");
  assert.equal(validateNarrativeBookSpec(contract).valid, true);
});
