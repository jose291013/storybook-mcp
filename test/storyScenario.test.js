import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { normalizeSceneContract, sceneContractImagePrompt } from "../src/agents/storyScenePlanner.js";
import { deterministicStoryPlanIssues } from "../src/agents/storyScenePlanAudit.js";
import {
  buildStorySceneTextRepairTargets,
  mergeStorySceneTextRepairResult,
  sanitizeStoryRepairText,
} from "../src/agents/storySceneTextRepair.js";
import { applyCreatorStoryScenarioEdits, clarificationAnswersForApproval, hasCurrentStoryScenarioAuditEvidence, normalizeStoryScenario, recoverLegacyLifecycleValidation, stabilizeStoryScenario, storyScenarioSnapshot, summarizeStoryScenarioValidation, validateStoryScenario, withStoryScenarioAuditEvidence } from "../src/services/storyScenario.js";
import {
  applyStoryScenarioRepairDirectives,
  buildStoryScenarioRepairDirectives,
  precompileStoryScenarioPassageLifecycles,
  validateStoryScenarioPassageLifecycles,
} from "../src/services/storyScenarioRepairs.js";
import { scenarioGenerationRoute } from "../src/services/storyScenarioGeneration.js";

function coherentPortalScenario() {
  return {
    title: "Le portail des dinosaures",
    summary: "Nolan et Mathéo découvrent un portail, le franchissent puis explorent la vallée.",
    characters: [
      { name: "Nolan", initialLocation: "la clairière" },
      { name: "Mathéo", initialLocation: "la clairière" },
      { name: "Alexandra", initialLocation: "la maison" },
    ],
    objects: [{ name: "casquette rouge", owner: "Nolan", initialState: "worn", trackEveryScene: true }],
    scenes: [
      {
        id: "scene-1", sceneNumber: 1, storyRole: "character_and_desire", title: "La découverte", action: "Nolan et Mathéo découvrent le portail fermé.",
        locationBefore: "la clairière", locationAfter: "la clairière", prerequisiteSceneIds: [],
        characterPresences: [
          { name: "Nolan", mode: "physical", location: "la clairière" },
          { name: "Mathéo", mode: "physical", location: "la clairière" },
        ],
        transition: { kind: "discover_passage", mechanism: "le portail bleu", from: "la clairière", to: "la clairière", characters: [] },
        objectStates: [{ name: "casquette rouge", owner: "Nolan", state: "worn", quantity: 1 }],
      },
      {
        id: "scene-2", sceneNumber: 2, storyRole: "external_problem", title: "Le passage", action: "Les deux enfants traversent le portail.",
        locationBefore: "la clairière", locationAfter: "la vallée des dinosaures", prerequisiteSceneIds: ["scene-1"],
        characterPresences: [
          { name: "Nolan", mode: "physical", location: "la vallée des dinosaures" },
          { name: "Mathéo", mode: "physical", location: "la vallée des dinosaures" },
        ],
        transition: { kind: "cross_passage", mechanism: "le portail bleu", from: "la clairière", to: "la vallée des dinosaures", characters: ["Nolan", "Mathéo"] },
        objectStates: [{ name: "casquette rouge", owner: "Nolan", state: "held", quantity: 1, instruction: "Nolan tient l'unique casquette; elle n'est pas sur sa tête." }],
      },
      {
        id: "scene-3", sceneNumber: 3, storyRole: "internal_problem", title: "Le conseil", action: "Nolan se rappelle les paroles d'Alexandra.",
        locationBefore: "la vallée des dinosaures", locationAfter: "la vallée des dinosaures", prerequisiteSceneIds: ["scene-2"],
        characterPresences: [
          { name: "Nolan", mode: "physical", location: "la vallée des dinosaures" },
          { name: "Mathéo", mode: "physical", location: "la vallée des dinosaures" },
          { name: "Alexandra", mode: "thought", location: "" },
        ],
        transition: { kind: "none", mechanism: "", from: "la vallée des dinosaures", to: "la vallée des dinosaures", characters: [] },
        objectStates: [{ name: "casquette rouge", owner: "Nolan", state: "worn", quantity: 1 }],
      },
    ],
  };
}

test("a portal scenario requires discovery before crossing and permits a nonphysical guide", () => {
  const result = validateStoryScenario(coherentPortalScenario());
  assert.deepEqual(result, { valid: true, issues: [] });
});

test("a final semantic audit remains valid across workflow metadata but not story changes", () => {
  const audited = withStoryScenarioAuditEvidence(coherentPortalScenario(), {
    auditedAt: "2026-07-30T10:00:00.000Z",
  });
  assert.equal(hasCurrentStoryScenarioAuditEvidence(audited), true);

  const stored = {
    ...audited,
    status: "proposed",
    revision: 7,
    fingerprint: "questionnaire-fingerprint",
    validation: { valid: true, issueCount: 0 },
    createdAt: "2026-07-30T10:01:00.000Z",
  };
  assert.equal(hasCurrentStoryScenarioAuditEvidence(stored), true);

  stored.scenes[0].action = "Nolan traverse le portail avant de le découvrir.";
  assert.equal(hasCurrentStoryScenarioAuditEvidence(stored), false);
});

test("only a first proposal uses the premium architect while revisions use targeted repair", () => {
  assert.deepEqual(scenarioGenerationRoute(null), {
    phase: "architect",
    modelRole: "story_architect",
  });
  assert.deepEqual(scenarioGenerationRoute({ revision: 1 }), {
    phase: "revision",
    modelRole: "story_repair",
  });
});

test("the narrative controller turns an undiscovered crossing into a targeted scenarist repair", () => {
  const scenario = coherentPortalScenario();
  scenario.scenes[0].title = "Le choix courageux";
  scenario.scenes[0].action = "Nolan et Mathéo observent la clairière et changent de stratégie.";
  scenario.scenes[0].transition = {
    kind: "none",
    mechanism: "",
    mechanismId: "",
    from: "la clairière",
    to: "la clairière",
    characters: [],
  };
  const validation = validateStoryScenario(scenario);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.includes("scene-2 crosses a passage before it was discovered"));

  const directives = buildStoryScenarioRepairDirectives(scenario, validation);
  assert.deepEqual(directives.map((directive) => ({
    code: directive.code,
    discoverySceneNumber: directive.discoverySceneNumber,
    crossingSceneNumber: directive.crossingSceneNumber,
    mechanismId: directive.mechanismId,
    travelers: directive.travelers,
  })), [{
    code: "discover_passage_before_crossing",
    discoverySceneNumber: 1,
    crossingSceneNumber: 2,
    mechanismId: "le_portail_bleu",
    travelers: ["Nolan", "Mathéo"],
  }]);
  assert.match(directives[0].instruction, /without asking the creator/i);
  assert.match(directives[0].instruction, /scene-1 must discover/i);

  const repaired = applyStoryScenarioRepairDirectives(scenario, directives, { language: "FR" });
  assert.equal(repaired.scenes[0].transition.kind, "discover_passage");
  assert.equal(repaired.scenes[0].transition.mechanismId, "le_portail_bleu");
  assert.match(repaired.scenes[0].action, /Nolan et Mathéo découvrent l’entrée du portail bleu, sans encore la franchir/);
  assert.deepEqual(validateStoryScenario(repaired), { valid: true, issues: [] });
});

test("the canonical passage diagnostic reuses the deterministic discovery repair", () => {
  const scenario = coherentPortalScenario();
  scenario.scenes[0].action = "Nolan et MathÃ©o observent la clairiÃ¨re et choisissent leur chemin.";
  scenario.scenes[0].transition = {
    kind: "none",
    mechanism: "",
    mechanismId: "",
    from: "la clairiÃ¨re",
    to: "la clairiÃ¨re",
    characters: [],
  };
  const validation = {
    valid: false,
    issues: ["scene-2: passage_discovery_missing: le portail bleu is crossed without an explicit approved discovery."],
    diagnostics: [{
      code: "passage_discovery_missing",
      path: "scenes[1].transition",
      sceneNumber: 2,
    }],
  };

  const directives = buildStoryScenarioRepairDirectives(scenario, validation);
  assert.equal(directives.length, 1);
  assert.equal(directives[0].discoverySceneNumber, 1);
  assert.equal(directives[0].crossingSceneNumber, 2);
  const repaired = applyStoryScenarioRepairDirectives(scenario, directives, { language: "FR" });
  assert.deepEqual(validateStoryScenario(repaired), { valid: true, issues: [] });
});

test("canonical passage repair aligns a descriptive crossing with an earlier stable passage id", () => {
  const scenario = coherentPortalScenario();
  scenario.scenes[0].transition.mechanismId = "portail_bleu";
  scenario.scenes[1].transition.mechanismId = "porte_lumineuse";
  scenario.scenes[1].transition.mechanism = "le portail bleu";
  scenario.scenes[1].characterMovements = [{
    id: "movement-1",
    ...scenario.scenes[1].transition,
  }];
  const directives = buildStoryScenarioRepairDirectives(scenario, {
    valid: false,
    issues: ["passage_discovery_missing: le portail bleu is crossed without an explicit approved discovery."],
    diagnostics: [{ code: "passage_discovery_missing", sceneNumber: 2 }],
  });

  assert.equal(directives.length, 1);
  assert.equal(directives[0].mechanismId, "portail_bleu");
  const repaired = applyStoryScenarioRepairDirectives(scenario, directives, { language: "FR" });
  assert.equal(repaired.scenes[1].transition.mechanismId, "portail_bleu");
  assert.equal(repaired.scenes[1].characterMovements[0].mechanismId, "portail_bleu");
  assert.deepEqual(validateStoryScenario(repaired), { valid: true, issues: [] });
});

test("passage preflight records discovery after arrival without replacing the arrival movement", () => {
  const scenario = coherentPortalScenario();
  scenario.characters[0].initialLocation = "la maison";
  scenario.characters[1].initialLocation = "la maison";
  scenario.scenes[0] = {
    ...scenario.scenes[0],
    title: "L'arrivée au seuil",
    action: "Nolan et Mathéo arrivent dans la clairière et observent les arbres.",
    locationBefore: "la maison",
    locationAfter: "la clairière",
    transition: {
      kind: "ordinary_travel",
      mechanism: "le sentier",
      mechanismId: "sentier",
      from: "la maison",
      to: "la clairière",
      characters: ["Nolan", "Mathéo"],
    },
    characterMovements: [{
      id: "movement-1",
      kind: "ordinary_travel",
      mechanism: "le sentier",
      mechanismId: "sentier",
      from: "la maison",
      to: "la clairière",
      characters: ["Nolan", "Mathéo"],
    }],
  };

  assert.equal(validateStoryScenarioPassageLifecycles(scenario).valid, false);
  const compiled = precompileStoryScenarioPassageLifecycles(scenario, { language: "FR" });

  assert.equal(scenario.scenes[0].characterMovements.length, 1, "the source remains immutable");
  assert.deepEqual(compiled.scenes[0].characterMovements.map((movement) => movement.kind), [
    "ordinary_travel",
    "discover_passage",
  ]);
  assert.equal(compiled.scenes[0].transition.kind, "ordinary_travel");
  assert.equal(compiled.scenes[0].characterMovements[1].mechanismId, "le_portail_bleu");
  assert.deepEqual(validateStoryScenarioPassageLifecycles(compiled), {
    valid: true,
    issues: [],
    diagnostics: [],
  });
  assert.deepEqual(validateStoryScenario(compiled), { valid: true, issues: [] });
});

test("a discovery after the first crossing cannot satisfy the passage lifecycle", () => {
  const scenario = coherentPortalScenario();
  scenario.scenes[0].transition = {
    kind: "none",
    mechanism: "",
    mechanismId: "",
    from: scenario.scenes[0].locationBefore,
    to: scenario.scenes[0].locationAfter,
    characters: [],
  };
  scenario.scenes[2].transition = {
    kind: "discover_passage",
    mechanism: "le portail bleu",
    mechanismId: "le_portail_bleu",
    from: scenario.scenes[2].locationBefore,
    to: scenario.scenes[2].locationBefore,
    characters: [],
  };

  const before = validateStoryScenarioPassageLifecycles(scenario);
  assert.equal(before.valid, false);
  assert.equal(before.diagnostics[0].sceneNumber, 2);

  const compiled = precompileStoryScenarioPassageLifecycles(scenario, { language: "FR" });
  assert.equal(compiled.scenes[0].transition.kind, "discover_passage");
  assert.deepEqual(validateStoryScenarioPassageLifecycles(compiled), {
    valid: true,
    issues: [],
    diagnostics: [],
  });
});

test("the narrative contract requires distinct progression, emotions and declared symbols", () => {
  const scenario = coherentPortalScenario();
  scenario.narrativeContract = {
    version: 1,
    privacyMode: "implicit_personal_depth",
    moralDelivery: "action_before_words",
    primarySymbol: { name: "casquette rouge", initialMeaning: "sécurité", evolvedMeaning: "courage choisi" },
    secondarySymbols: [],
  };
  scenario.scenes.forEach((scene, index) => {
    scene.narrativeFunction = ["découvrir le seuil", "choisir de traverser", "transformer le conseil en action"][index];
    scene.dominantEmotion = ["curiosité", "hésitation", "confiance"][index];
    scene.emotionalShift = ["attente vers curiosité", "peur vers décision", "doute vers confiance"][index];
    scene.storyChange = ["le portail devient un objectif", "les enfants atteignent la vallée", "Nolan décide d'avancer seul"][index];
    scene.symbolUse = index === 2 ? [{ name: "casquette rouge", role: "Nolan la remet comme signe de décision" }] : [];
  });
  assert.deepEqual(validateStoryScenario(scenario), { valid: true, issues: [] });

  scenario.scenes[1].storyChange = scenario.scenes[0].storyChange;
  scenario.scenes[2].symbolUse = [{ name: "étoile générique", role: "décoration" }];
  scenario.narrativeContract.secondarySymbols = [
    { name: "pont", purpose: "passage" },
    { name: "feuille", purpose: "orientation" },
    { name: "étoile", purpose: "décoration" },
  ];
  const invalid = validateStoryScenario(scenario);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.some((issue) => issue.includes("duplicates story change")));
  assert.ok(invalid.issues.some((issue) => issue.includes("is not declared")));
  assert.ok(invalid.issues.some((issue) => issue.includes("at most two secondary symbols")));
  const summary = summarizeStoryScenarioValidation(invalid);
  assert.ok(summary.categories.includes("progression"));
  assert.ok(summary.categories.includes("symbol"));
});

test("scenario normalization preserves the new editorial metadata without imposing it on legacy scenarios", () => {
  const modern = normalizeStoryScenario({ scenario: {
    title: "Le courage discret",
    summary: "Lina agit avant de nommer ce qu'elle a appris.",
    narrative_contract: {
      version: 1,
      privacy_mode: "implicit_personal_depth",
      moral_delivery: "action_before_words",
      primary_symbol: { name: "ruban", initial_meaning: "doute", evolved_meaning: "élan" },
      secondary_symbols: [{ name: "pont", purpose: "rendre le passage concret" }],
    },
    characters: [{ name: "Lina", initial_location: "le jardin" }],
    scenes: [{
      scene_number: 1,
      title: "Le premier pas",
      action: "Lina noue le ruban et avance.",
      location_before: "le jardin",
      location_after: "le jardin",
      narrative_function: "déclencher l'aventure",
      dominant_emotion: "hésitation",
      emotional_shift: "hésitation vers curiosité",
      story_change: "Lina choisit de suivre le sentier",
      symbol_use: [{ name: "ruban", role: "marque le premier choix" }],
      character_presences: [{ name: "Lina", mode: "physical", location: "le jardin" }],
      transition: { kind: "none", from: "le jardin", to: "le jardin", characters: [] },
    }],
  } }, {
    pagePlan: [{ page_type: "image", scene_number: 1, story_role: "character_and_desire" }],
    canonicalCharacters: [{ name: "Lina", role: "child", storyRole: "hero" }],
  });
  assert.equal(modern.narrativeContract.primarySymbol.name, "ruban");
  assert.equal(modern.scenes[0].dominantEmotion, "hésitation");
  assert.equal(modern.version, 2);
  assert.equal(modern.movementLedgerVersion, 1);
  assert.equal(modern.scenes[0].characterPresences[0].phase, "end");
  assert.equal(validateStoryScenario(modern).valid, true);

  const legacy = coherentPortalScenario();
  assert.equal(legacy.narrativeContract, undefined);
  assert.equal(validateStoryScenario(legacy).valid, true);
});

test("persisted version-one scenarios remain readable during the movement-ledger migration", () => {
  const legacy = coherentPortalScenario();
  legacy.version = 1;
  assert.equal(storyScenarioSnapshot({
    continuitySnapshot: { storyScenario: legacy },
  }), legacy);
});

test("scenario validation rejects crossing before discovery and physical teleportation", () => {
  const scenario = coherentPortalScenario();
  scenario.scenes[0].transition = { kind: "none", mechanism: "", from: "la clairière", to: "la clairière", characters: [] };
  scenario.scenes[2].characterPresences[2] = { name: "Alexandra", mode: "physical", location: "la vallée des dinosaures" };
  const result = validateStoryScenario(scenario);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.includes("before it was discovered")));
  assert.ok(result.issues.some((issue) => issue.includes("Alexandra appears") && issue.includes("without traveling")));
});

test("scenario validation rejects two simultaneous states for one personal object", () => {
  const scenario = coherentPortalScenario();
  scenario.scenes[1].objectStates.push({ name: "casquette rouge", owner: "Nolan", state: "worn", quantity: 1 });
  const result = validateStoryScenario(scenario);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.includes("two simultaneous states")));
});

test("owner-specific copies of the same recurring object remain distinct", () => {
  const scenario = coherentPortalScenario();
  scenario.objects = [
    { name: "bracelet lumineux", owner: "Nolan", initialState: "worn", trackEveryScene: true },
    { name: "bracelet lumineux", owner: "Mathéo", initialState: "worn", trackEveryScene: true },
  ];
  for (const scene of scenario.scenes) {
    scene.objectStates = [
      { name: "bracelet lumineux", owner: "Nolan", state: "worn", quantity: 1 },
      { name: "bracelet lumineux", owner: "Mathéo", state: "worn", quantity: 1 },
    ];
  }
  assert.deepEqual(validateStoryScenario(scenario), { valid: true, issues: [] });
});

test("version-2 object entity ids preserve same-name personal copies without model owners", () => {
  const normalized = normalizeStoryScenario({ scenario: {
    title: "Les bulles",
    summary: "Lina et Eva utilisent chacune leur bulle.",
    characters: [
      { name: "Lina", initial_location: "le récif" },
      { name: "Eva", initial_location: "le récif" },
    ],
    objects: [
      { entity_id: "lina_bubble", name: "bulle respiratoire", track_every_scene: true },
      { entity_id: "eva_bubble", name: "bulle respiratoire", track_every_scene: true },
    ],
    causal_graph: {
      version: 2,
      entities: [
        { id: "lina_bubble", label: "bulle respiratoire", initial_state: "worn", initial_owner_character: "Lina", initial_quantity: 1 },
        { id: "eva_bubble", label: "bulle respiratoire", initial_state: "worn", initial_owner_character: "Eva", initial_quantity: 1 },
      ],
      events: [],
    },
    scenes: [{
      scene_number: 1,
      title: "Sous l'eau",
      action: "Lina et Eva observent le récif avec leurs bulles distinctes.",
      location_before: "le récif",
      location_after: "le récif",
      character_presences: [
        { name: "Lina", mode: "physical", phase: "throughout", location: "le récif" },
        { name: "Eva", mode: "physical", phase: "throughout", location: "le récif" },
      ],
      transition: { kind: "none", from: "le récif", to: "le récif", characters: [] },
    }],
  } }, {
    pagePlan: [{ page_type: "image", scene_number: 1, story_role: "character_and_desire" }],
    canonicalCharacters: [
      { name: "Lina", role: "child", storyRole: "hero" },
      { name: "Eva", role: "other", storyRole: "ally" },
    ],
    requireCausalGraph: true,
  });
  const stabilized = stabilizeStoryScenario(normalized);

  assert.deepEqual(stabilized.objects.map(({ objectId }) => objectId), ["lina_bubble", "eva_bubble"]);
  assert.deepEqual(
    stabilized.scenes[0].objectStates.map(({ objectId, owner }) => [objectId, owner]),
    [["lina_bubble", "Lina"], ["eva_bubble", "Eva"]],
  );
});

test("one unique recurring object may change hands without becoming a second copy", () => {
  const scenario = coherentPortalScenario();
  scenario.scenes[1].objectStates = [{
    name: "casquette rouge",
    owner: "Mathéo",
    state: "held",
    quantity: 1,
    instruction: "Mathéo tient l’unique casquette pendant que Nolan traverse.",
  }];
  assert.deepEqual(validateStoryScenario(scenario), { valid: true, issues: [] });
});

function transformableSeedScenario() {
  const scene = (sceneNumber, title, action, seedState = "held", flowerState = "absent") => ({
    id: `scene-${sceneNumber}`,
    sceneNumber,
    storyRole: ["character_and_desire", "external_problem", "internal_problem", "simple_plan", "attempt", "success_and_transformation"][sceneNumber - 1],
    title,
    action,
    locationBefore: "forêt enchantée",
    locationAfter: "forêt enchantée",
    prerequisiteSceneIds: sceneNumber === 1 ? [] : [`scene-${sceneNumber - 1}`],
    characterPresences: [{
      name: "Bastien",
      mode: "physical",
      phase: "throughout",
      location: "forêt enchantée",
      action: "agit dans la scène",
    }],
    transition: {
      kind: "none",
      mechanism: "",
      mechanismId: "",
      from: "forêt enchantée",
      to: "forêt enchantée",
      characters: [],
    },
    objectStates: [
      { name: "graine aux mille couleurs", owner: "Bastien", state: seedState, quantity: 1 },
      { name: "fleur éclatante", owner: "Bastien", state: flowerState, quantity: 1 },
    ],
  });
  return {
    language: "FR",
    title: "La graine aux mille couleurs",
    summary: "Bastien découvre une graine, apprend à en prendre soin et voit naître une fleur.",
    characters: [{ name: "Bastien", initialLocation: "forêt enchantée" }],
    objects: [
      { name: "graine aux mille couleurs", owner: "Bastien", initialState: "held", trackEveryScene: true },
      { name: "fleur éclatante", owner: "Bastien", initialState: "absent", trackEveryScene: true },
    ],
    scenes: [
      scene(1, "Le désir", "Bastien cherche une manière de mieux comprendre ses émotions."),
      scene(2, "La découverte", "Bastien trouve une graine aux mille couleurs au bord du sentier."),
      scene(3, "La première observation", "Bastien observe la graine et remarque ses changements de couleur."),
      scene(4, "La plantation", "Bastien plante la graine aux mille couleurs dans la terre."),
      scene(5, "La patience", "Bastien arrose la terre et attend malgré son impatience."),
      scene(6, "La transformation", "Une fleur éclatante pousse enfin devant Bastien."),
    ],
  };
}

test("a discovered transformable object is absent before discovery and cannot reappear after planting", () => {
  const stabilized = stabilizeStoryScenario(transformableSeedScenario());
  assert.deepEqual(
    stabilized.scenes.map((scene) => scene.objectStates.find((state) => state.name.startsWith("graine"))?.state),
    ["absent", "held", "held", "planted", "planted", "transformed"],
  );
  assert.deepEqual(
    stabilized.scenes.map((scene) => scene.objectStates.find((state) => state.name === "fleur éclatante")?.state),
    ["absent", "absent", "absent", "absent", "absent", "visible"],
  );
  assert.equal(stabilized.objects[0].lifecycle.kind, "transformable");
  assert.equal(stabilized.objects[0].lifecycle.events.at(-1).resultingObject, "fleur éclatante");
  assert.deepEqual(validateStoryScenario(stabilized), { valid: true, issues: [] });
});

test("transformable-object inference recognizes French, Spanish and English causal wording", () => {
  const fixtures = [
    {
      language: "ES",
      source: "semilla de colores",
      result: "flor brillante",
      actions: [
        "Bastien busca una manera de comprender sus emociones.",
        "Bastien encuentra una semilla de colores.",
        "Bastien observa la semilla de colores.",
        "Bastien planta la semilla de colores.",
        "Bastien cuida la tierra con paciencia.",
        "Una flor brillante crece delante de Bastien.",
      ],
    },
    {
      language: "EN",
      source: "many-colored seed",
      result: "bright flower",
      actions: [
        "Bastien looks for a way to understand his feelings.",
        "Bastien finds a many-colored seed.",
        "Bastien observes the many-colored seed.",
        "Bastien plants the many-colored seed.",
        "Bastien patiently cares for the soil.",
        "A bright flower grows in front of Bastien.",
      ],
    },
  ];
  for (const fixture of fixtures) {
    const scenario = transformableSeedScenario();
    scenario.language = fixture.language;
    scenario.objects[0].name = fixture.source;
    scenario.objects[1].name = fixture.result;
    scenario.scenes.forEach((scene, index) => {
      scene.action = fixture.actions[index];
      scene.objectStates[0].name = fixture.source;
      scene.objectStates[1].name = fixture.result;
    });
    const stabilized = stabilizeStoryScenario(scenario);
    assert.deepEqual(
      stabilized.scenes.map((scene) => scene.objectStates.find((state) => state.name === fixture.source)?.state),
      ["absent", "held", "held", "planted", "planted", "transformed"],
    );
    assert.equal(stabilized.objects[0].lifecycle.events.at(-1).resultingObject, fixture.result);
    assert.deepEqual(validateStoryScenario(stabilized), { valid: true, issues: [] });
  }
});

test("ordinary growth and English travel wording do not create false terminal events", () => {
  const scenario = coherentPortalScenario();
  scenario.objects = [
    { name: "plante verte", owner: "Nolan", initialState: "visible", trackEveryScene: true },
    { name: "silver key", owner: "Nolan", initialState: "carried", trackEveryScene: true },
  ];
  scenario.scenes.forEach((scene) => {
    scene.objectStates = [
      { name: "plante verte", owner: "Nolan", state: "visible", quantity: 1 },
      { name: "silver key", owner: "Nolan", state: "carried", quantity: 1 },
    ];
  });
  scenario.scenes[0].action = "La plante verte pousse près du portail.";
  scenario.scenes[2].action = "Nolan and Mathéo come home carrying the silver key.";
  const stabilized = stabilizeStoryScenario(scenario);
  assert.equal(stabilized.objects[0].lifecycle, undefined);
  assert.equal(stabilized.objects[1].lifecycle, undefined);
  assert.deepEqual(validateStoryScenario(stabilized), { valid: true, issues: [] });
});

test("explicit lifecycle events survive normalization and drive deterministic scene states", () => {
  const normalized = normalizeStoryScenario({ scenario: {
    title: "Le ticket unique",
    summary: "Lina découvre puis utilise son ticket.",
    characters: [{ name: "Lina", initial_location: "la gare" }],
    objects: [{
      name: "ticket doré",
      owner: "Lina",
      initial_state: "held",
      track_every_scene: true,
      lifecycle: {
        version: 1,
        kind: "consumable",
        events: [
          { scene_number: 2, type: "introduce", state: "held" },
          { scene_number: 4, type: "consume", state: "used_up" },
        ],
      },
    }],
    scenes: Array.from({ length: 6 }, (_, index) => ({
      scene_number: index + 1,
      title: `Étape ${index + 1}`,
      action: index === 1 ? "Lina reçoit le ticket doré." : index === 3 ? "Lina utilise le ticket doré pour ouvrir la porte." : "Lina avance.",
      location_before: "la gare",
      location_after: "la gare",
      character_presences: [{ name: "Lina", mode: "physical", phase: "throughout", location: "la gare" }],
      transition: { kind: "none", from: "la gare", to: "la gare", characters: [] },
      object_states: [{ name: "ticket doré", owner: "Lina", state: "held", quantity: 1 }],
    })),
  } }, {
    pagePlan: Array.from({ length: 6 }, (_, index) => ({
      page_type: "image",
      scene_number: index + 1,
      story_role: `role-${index + 1}`,
    })),
    canonicalCharacters: [{ name: "Lina", role: "child", storyRole: "hero" }],
  });
  const stabilized = stabilizeStoryScenario(normalized);
  assert.deepEqual(stabilized.scenes.map((scene) => scene.objectStates[0].state), [
    "absent", "held", "held", "used_up", "used_up", "used_up",
  ]);
  assert.equal(stabilized.objects[0].initialState, "absent");
  assert.match(stabilized.scenes[1].objectStates[0].instruction, /first physical appearance/i);
  assert.doesNotMatch(stabilized.scenes[2].objectStates[0].instruction, /first physical appearance/i);
  assert.deepEqual(validateStoryScenario(stabilized), { valid: true, issues: [] });
});

test("scenario validation rejects an intact object returning after an irreversible event", () => {
  const scenario = stabilizeStoryScenario(transformableSeedScenario());
  scenario.scenes[5].objectStates.find((state) => state.name.startsWith("graine")).state = "held";
  const result = validateStoryScenario(scenario);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.includes("must be transformed according to its lifecycle")));
});

test("whole-book deterministic audit rejects a planted object described in a hand", () => {
  const approvedScenario = stabilizeStoryScenario(transformableSeedScenario());
  const issues = deterministicStoryPlanIssues({
    approvedScenario,
    pageTexts: { 8: "Bastien tient à nouveau la graine aux mille couleurs dans sa main." },
    sceneContracts: [{
      scene_number: 4,
      text_page_number: 8,
      named_characters: [{ name: "Bastien" }],
    }],
    canonicalCharacters: [{ name: "Bastien" }],
    language: "FR",
  });
  assert.ok(issues.some((issue) => issue.code === "irreversible_object_reappears"));
});

test("personal universe mechanisms activate before zone entry and are stored outside it", () => {
  const characters = [
    { name: "Bastien", initialLocation: "maison de Bastien" },
    { name: "Marie", initialLocation: "maison de Bastien" },
  ];
  const presences = (location, phase = "throughout") => characters.map(({ name }) => ({
    name,
    mode: "physical",
    phase,
    location,
  }));
  const breathingStates = () => characters.map(({ name }) => ({
    name: "breathing_and_voice_bubble",
    owner: name,
    state: "worn",
    quantity: 1,
    instruction: `${name} porte déjà la bulle.`,
  }));
  const scenario = {
    language: "FR",
    title: "Le pont de bulles",
    summary: "Bastien et Marie préparent leur aventure avant d’explorer le récif.",
    worldContract: { id: "coral_ocean" },
    characters,
    objects: characters.map(({ name }) => ({
      name: "breathing_and_voice_bubble",
      owner: name,
      initialState: "worn",
      trackEveryScene: true,
    })),
    scenes: [
      {
        id: "scene-1",
        sceneNumber: 1,
        storyRole: "character_and_desire",
        title: "Le rêve",
        action: "Bastien imagine un pont de bulles.",
        locationBefore: "maison de Bastien",
        locationAfter: "maison de Bastien",
        prerequisiteSceneIds: [],
        characterPresences: presences("maison de Bastien"),
        transition: { kind: "none", mechanism: "", mechanismId: "", from: "maison de Bastien", to: "maison de Bastien", characters: [] },
        objectStates: breathingStates(),
      },
      {
        id: "scene-2",
        sceneNumber: 2,
        storyRole: "external_problem",
        title: "La préparation",
        action: "Bastien et Marie vérifient leur plan.",
        locationBefore: "maison de Bastien",
        locationAfter: "maison de Bastien",
        prerequisiteSceneIds: ["scene-1"],
        characterPresences: presences("maison de Bastien"),
        transition: { kind: "none", mechanism: "", mechanismId: "", from: "maison de Bastien", to: "maison de Bastien", characters: [] },
        objectStates: breathingStates(),
      },
      {
        id: "scene-3",
        sceneNumber: 3,
        storyRole: "attempt",
        title: "Dans le récif",
        action: "Bastien et Marie explorent le récif corallien.",
        locationBefore: "maison de Bastien",
        locationAfter: "récif corallien",
        prerequisiteSceneIds: ["scene-2"],
        characterPresences: presences("récif corallien", "end"),
        transition: { kind: "ordinary_travel", mechanism: "passage aquatique", mechanismId: "passage_aquatique", from: "maison de Bastien", to: "récif corallien", characters: ["Bastien", "Marie"] },
        objectStates: breathingStates(),
      },
      {
        id: "scene-4",
        sceneNumber: 4,
        storyRole: "resolution",
        title: "Le retour",
        action: "Bastien et Marie rentrent à la maison.",
        locationBefore: "récif corallien",
        locationAfter: "maison de Bastien",
        prerequisiteSceneIds: ["scene-3"],
        characterPresences: presences("maison de Bastien", "end"),
        transition: { kind: "return_travel", mechanism: "passage aquatique", mechanismId: "passage_aquatique", from: "récif corallien", to: "maison de Bastien", characters: ["Bastien", "Marie"] },
        objectStates: breathingStates(),
      },
    ],
  };

  const stabilized = stabilizeStoryScenario(scenario);
  assert.deepEqual(stabilized.objects.map(({ owner, initialState }) => ({ owner, initialState })), [
    { owner: "Bastien", initialState: "absent" },
    { owner: "Marie", initialState: "absent" },
  ]);
  assert.deepEqual(stabilized.scenes.map((scene) => scene.objectStates.map(({ owner, state }) => ({ owner, state }))), [
    [{ owner: "Bastien", state: "absent" }, { owner: "Marie", state: "absent" }],
    [{ owner: "Bastien", state: "worn" }, { owner: "Marie", state: "worn" }],
    [{ owner: "Bastien", state: "worn" }, { owner: "Marie", state: "worn" }],
    [{ owner: "Bastien", state: "stored" }, { owner: "Marie", state: "stored" }],
  ]);
  assert.match(stabilized.scenes[1].action, /chacun leur propre bulle de respiration et de communication/);
  assert.doesNotMatch(stabilized.scenes[0].objectStates[0].instruction, /porte uniquement/);
  assert.deepEqual(validateStoryScenario(stabilized), { valid: true, issues: [] });
});

test("scenario validation rejects an object held by an absent owner", () => {
  const scenario = coherentPortalScenario();
  scenario.scenes[2].objectStates = [{
    name: "carnet",
    owner: "Alexandra",
    state: "held",
    quantity: 1,
  }];
  const result = validateStoryScenario(scenario);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.includes("Alexandra cannot held carnet while not physically present")));
});

test("scenario normalization uses the scene location for physical presences", () => {
  const scenario = normalizeStoryScenario({ scenario: {
    title: "Le portail", summary: "Une traversée cohérente.",
    characters: [{ name: "Nolan", initial_location: "la vallée" }],
    scenes: [{
      scene_number: 1, title: "Dans la vallée", action: "Nolan avance près du portail.",
      location_before: "la vallée", location_after: "la vallée",
      character_presences: [{ name: "Nolan", mode: "physical", location: "près du portail" }],
      transition: { kind: "none", from: "la vallée", to: "la vallée", characters: [] },
    }],
  } }, {
    pagePlan: [{ page_type: "image", scene_number: 1, story_role: "character_and_desire" }],
    canonicalCharacters: [{ name: "Nolan", role: "child", storyRole: "hero" }],
  });
  assert.equal(scenario.scenes[0].characterPresences[0].location, "la vallée");
  assert.equal(validateStoryScenario(scenario).valid, true);
});

test("scenario normalization preserves a parent's relationship and localized family address", () => {
  const scenario = normalizeStoryScenario({ scenario: {
    title: "Le conseil",
    summary: "Malvina écoute sa maman.",
    characters: [
      { name: "Malvina", initial_location: "le jardin" },
      { name: "Maïté", initial_location: "le jardin" },
    ],
    scenes: [{
      scene_number: 1,
      title: "Le conseil",
      action: "Maïté conseille Malvina.",
      location_before: "le jardin",
      location_after: "le jardin",
      character_presences: [
        { name: "Malvina", mode: "physical", location: "le jardin" },
        { name: "Maïté", mode: "physical", location: "le jardin" },
      ],
      transition: { kind: "none", from: "le jardin", to: "le jardin", characters: [] },
    }],
  } }, {
    pagePlan: [{ page_type: "image", scene_number: 1, story_role: "character_and_desire" }],
    canonicalCharacters: [
      { name: "Malvina", role: "child", storyRole: "hero", relationship: "hero" },
      { name: "Maïté", role: "other", storyRole: "guide", relationship: "mère" },
    ],
    language: "FR",
  });
  assert.equal(scenario.characters.find((character) => character.name === "Maïté").relationship, "mère");
  assert.equal(scenario.characters.find((character) => character.name === "Maïté").preferredAddress, "Maman");
});

test("the final plan rejects an absent parent's physical action and first-name family dialogue", () => {
  const approvedScenario = {
    characters: [
      { name: "Malvina", relationship: "hero" },
      { name: "Maïté", relationship: "mère", preferredAddress: "Maman" },
    ],
    scenes: [{
      sceneNumber: 3,
      characterPresences: [{ name: "Malvina", mode: "physical", location: "le pont" }],
    }],
  };
  const issues = deterministicStoryPlanIssues({
    approvedScenario,
    pageTexts: {
      6: "Maïté, debout à côté de Malvina, pose une main sur son épaule. « Suivons les conseils de Maïté », pense Malvina.",
    },
    sceneContracts: [{
      scene_number: 3,
      text_page_number: 6,
      named_characters: [{ name: "Malvina" }],
    }],
    canonicalCharacters: approvedScenario.characters,
    language: "FR",
  });
  assert.ok(issues.some((issue) => issue.code === "unapproved_character_mention"));
  assert.ok(issues.some((issue) => issue.code === "family_address"));
});

test("an explicitly remembered guide remains valid without a physical action", () => {
  const issues = deterministicStoryPlanIssues({
    approvedScenario: {
      characters: [{ name: "Nolan" }, { name: "Alexandra" }],
      scenes: [{
        sceneNumber: 4,
        characterPresences: [
          { name: "Nolan", mode: "physical" },
          { name: "Alexandra", mode: "memory" },
        ],
      }],
    },
    pageTexts: { 8: "Nolan se souvient des conseils d’Alexandra et reprend courage." },
    sceneContracts: [{
      scene_number: 4,
      text_page_number: 8,
      named_characters: [{ name: "Nolan" }],
    }],
    canonicalCharacters: [{ name: "Nolan" }, { name: "Alexandra" }],
  });
  assert.deepEqual(issues, []);
});

test("targeted story repair maps a fidelity issue to only its paired text page", () => {
  const targets = buildStorySceneTextRepairTargets({
    approvedScenario: {
      scenes: [
        { sceneNumber: 4, action: "Les amis observent le ciel.", characterPresences: [{ name: "Lua", mode: "physical" }] },
        { sceneNumber: 5, action: "Lua résout l'énigme.", characterPresences: [{ name: "Lua", mode: "physical" }] },
      ],
    },
    pageTexts: {
      8: "Lua observe le ciel.",
      10: "Tyam rejoint Lua et résout l'énigme.",
    },
    sceneContracts: [
      { scene_number: 4, text_page_number: 8 },
      { scene_number: 5, text_page_number: 10 },
    ],
    issues: [{
      sceneNumber: 5,
      code: "unapproved_character_mention",
      explanation: "Tyam is absent from the approved scene.",
    }],
    canonicalCharacters: [{ name: "Lua" }, { name: "Tyam" }, { name: "Santi" }],
  });
  assert.deepEqual(targets.map((target) => target.text_page_number), [10]);
  assert.equal(targets[0].approved_scene.sceneNumber, 5);
  assert.match(targets[0].current_text, /Tyam/);
  assert.deepEqual(targets[0].forbidden_characters, ["Tyam", "Santi"]);
});

test("targeted story repair deterministically removes every sentence naming an absent character", () => {
  const repaired = sanitizeStoryRepairText({
    text: "Lua observe les indices. Santi rejoint soudain Lua. Tyam lui adresse un signe. Lua comprend enfin l'énigme.",
    forbiddenCharacters: ["Tyam", "Santi"],
    fallbackText: "Lua résout l'énigme.",
  });
  assert.equal(repaired, "Lua observe les indices. Lua comprend enfin l'énigme.");
  assert.doesNotMatch(repaired, /Tyam|Santi/);
});

test("targeted story repair falls back to the approved action if every generated sentence is forbidden", () => {
  const repaired = sanitizeStoryRepairText({
    text: "Santi rejoint Tyam.",
    forbiddenCharacters: ["Tyam", "Santi"],
    fallbackText: "Lua résout seule l'énigme du château.",
  });
  assert.equal(repaired, "Lua résout seule l'énigme du château.");
});

test("targeted story repair replaces only affected prose and its structured speaker", () => {
  const targets = buildStorySceneTextRepairTargets({
    approvedScenario: {
      scenes: [{
        sceneNumber: 8,
        action: "Noa demande un moment avant de réessayer.",
        characterPresences: [
          { name: "Noa", mode: "physical" },
          { name: "Eva", mode: "physical" },
        ],
      }],
    },
    pageTexts: {
      16: "Eva lève la main et dit «Necesito un momento».",
      18: "La page suivante reste identique.",
    },
    speechSegmentsByPage: {
      16: [{ speaker: "Eva", mode: "dialogue", text: "Necesito un momento" }],
      18: [],
    },
    sceneContracts: [{
      scene_number: 8,
      text_page_number: 16,
    }],
    issues: [{
      sceneNumber: 8,
      code: "pause_requested_by_wrong_character",
      explanation: "Noa, not Eva, asks for the pause.",
    }],
    canonicalCharacters: [{ name: "Noa" }, { name: "Eva" }],
  });
  const repaired = mergeStorySceneTextRepairResult({
    pageTexts: {
      16: "Eva lève la main et dit «Necesito un momento».",
      18: "La page suivante reste identique.",
    },
    speechSegmentsByPage: {
      16: [{ speaker: "Eva", mode: "dialogue", text: "Necesito un momento" }],
      18: [],
    },
    targets,
    result: {
      page_texts: [{
        page_number: 16,
        text: "Noa lève la main et dit «Necesito un momento».",
        speech_segments: [{
          speaker: "Noa",
          mode: "dialogue",
          text: "Necesito un momento",
        }],
      }],
    },
    canonicalCharacters: [{ name: "Noa" }, { name: "Eva" }],
  });

  assert.equal(repaired.pageTexts[16], "Noa lève la main et dit «Necesito un momento».");
  assert.equal(repaired.pageTexts[18], "La page suivante reste identique.");
  assert.deepEqual(repaired.speechSegmentsByPage[16], [{
    speaker: "Noa",
    mode: "dialogue",
    text: "Necesito un momento",
  }]);
  assert.deepEqual(repaired.speechSegmentsByPage[18], []);
});

test("invalid scenario diagnostics identify editable scenes without exposing character names", () => {
  const summary = summarizeStoryScenarioValidation({ valid: false, issues: [
    "scene-9: Nolan appears in la vallée without traveling there",
    "scene-4 crosses a passage before it was discovered",
    "scene-12: casquette rouge has two simultaneous states",
  ] });
  assert.deepEqual(summary.sceneNumbers, [4, 9, 12]);
  assert.deepEqual(summary.categoryScenes, { travel: [9], passage: [4], object: [12] });
  assert.equal(summary.issueCount, 3);
  assert.doesNotMatch(JSON.stringify(summary), /Nolan|casquette/);
});

test("semantic audit diagnostics retain a bounded creator-safe explanation", () => {
  const summary = summarizeStoryScenarioValidation({
    valid: false,
    issues: ["scene-5: repeated_object_introduction: La route est présentée comme nouvelle une seconde fois."],
    diagnostics: [{
      code: "repeated object introduction",
      sceneNumber: 5,
      explanation: "La route est présentée comme nouvelle une seconde fois.",
    }],
  });
  assert.equal(summary.version, 2);
  assert.deepEqual(summary.diagnostics, [{
    code: "repeated_object_introduction",
    sceneNumber: 5,
    explanation: "La route est présentée comme nouvelle une seconde fois.",
  }]);
});

test("legacy repeated-introduction false positives are recovered without changing visible story text", () => {
  const scenario = normalizeStoryScenario({ scenario: {
    title: "La route des nuages",
    summary: "Noa suit une route céleste.",
    characters: [{ name: "Noa", initial_location: "le jardin" }],
    objects: [{
      name: "Route Celeste",
      owner: "Noa",
      initial_state: "absent",
      track_every_scene: true,
      lifecycle: {
        version: 1,
        kind: "discoverable",
        events: [{ scene_number: 2, type: "introduce", state: "visible" }],
      },
    }],
    scenes: Array.from({ length: 3 }, (_, index) => ({
      scene_number: index + 1,
      title: `Étape ${index + 1}`,
      action: index === 1 ? "Noa découvre la Route Celeste." : "Noa avance avec confiance.",
      location_before: "le jardin",
      location_after: "le jardin",
      character_presences: [{ name: "Noa", mode: "physical", location: "le jardin" }],
      transition: { kind: "none", from: "le jardin", to: "le jardin", characters: [] },
      object_states: [{ name: "Route Celeste", owner: "Noa", state: "visible", quantity: 1 }],
    })),
  } }, {
    pagePlan: Array.from({ length: 3 }, (_, index) => ({
      page_type: "image",
      scene_number: index + 1,
      story_role: `role-${index + 1}`,
    })),
    canonicalCharacters: [{ name: "Noa", role: "child", storyRole: "hero" }],
  });
  const legacy = stabilizeStoryScenario(scenario);
  const visibleStory = legacy.scenes.map(({ title, action }) => ({ title, action }));
  legacy.scenes[2].objectStates[0].instruction = "Route Celeste: first physical appearance in this scene; exactly one copy.";
  legacy.status = "needs_revision";
  legacy.validation = {
    valid: false,
    categories: ["incomplete"],
    issueCount: 1,
    sceneNumbers: [3],
    categoryScenes: { incomplete: [3] },
  };
  const repaired = recoverLegacyLifecycleValidation(legacy, { now: "2026-07-30T00:00:00.000Z" });
  assert.ok(repaired);
  assert.equal(repaired.status, "proposed");
  assert.equal(repaired.validation.valid, true);
  assert.equal(repaired.validation.repairedFrom, "object_lifecycle_first_appearance_v1");
  assert.deepEqual(repaired.scenes.map(({ title, action }) => ({ title, action })), visibleStory);
  assert.doesNotMatch(repaired.scenes[2].objectStates[0].instruction, /first physical appearance/i);
});

test("legacy validation recovery refuses unrelated generic rejections", () => {
  const scenario = coherentPortalScenario();
  scenario.status = "needs_revision";
  scenario.validation = {
    valid: false,
    categories: ["incomplete"],
    issueCount: 1,
    sceneNumbers: [2],
    categoryScenes: { incomplete: [2] },
  };
  assert.equal(recoverLegacyLifecycleValidation(scenario), null);
});

test("scenario stabilization repairs invisible metadata without changing story events", () => {
  const scenario = coherentPortalScenario();
  scenario.scenes[1].prerequisiteSceneIds = [];
  scenario.scenes[1].transition.characters = [];
  scenario.scenes[1].transition.from = "ailleurs";
  scenario.scenes[1].transition.to = "ailleurs";
  scenario.scenes[1].objectStates = [];
  scenario.scenes[2].prerequisiteSceneIds = [];
  const stabilized = stabilizeStoryScenario(scenario);
  assert.deepEqual(stabilized.scenes[1].transition.characters, ["Nolan", "Mathéo"]);
  assert.equal(stabilized.scenes[1].transition.from, "la clairière");
  assert.equal(stabilized.scenes[1].transition.to, "la vallée des dinosaures");
  assert.deepEqual(stabilized.scenes[2].prerequisiteSceneIds, ["scene-2"]);
  assert.equal(stabilized.scenes[1].objectStates[0].name, "casquette rouge");
  assert.equal(validateStoryScenario(stabilized).valid, true);
});

test("a character can join residents from another established location without moving the focal scene", () => {
  const scenario = {
    title: "L'atelier des émotions",
    summary: "Bastien travaille à l'atelier avant que Marie le rejoigne depuis la maison.",
    characters: [
      { name: "Bastien", initialLocation: "atelier de la Ville merveilleuse" },
      { name: "Marie", initialLocation: "maison familiale" },
    ],
    objects: [],
    scenes: [
      {
        id: "scene-1",
        sceneNumber: 1,
        storyRole: "character_and_desire",
        title: "Bastien commence son ouvrage",
        action: "Bastien observe les matériaux de l'atelier.",
        locationBefore: "atelier de la Ville merveilleuse",
        locationAfter: "atelier de la Ville merveilleuse",
        prerequisiteSceneIds: [],
        characterPresences: [
          { name: "Bastien", mode: "physical", location: "atelier de la Ville merveilleuse" },
        ],
        transition: {
          kind: "none",
          mechanism: "",
          mechanismId: "",
          from: "atelier de la Ville merveilleuse",
          to: "atelier de la Ville merveilleuse",
          characters: [],
        },
        objectStates: [],
      },
      {
        id: "scene-2",
        sceneNumber: 2,
        storyRole: "external_problem",
        title: "Marie rejoint Bastien à l'atelier",
        action: "Marie quitte la maison familiale et rejoint l'atelier pour encourager Bastien.",
        locationBefore: "atelier de la Ville merveilleuse",
        locationAfter: "atelier de la Ville merveilleuse",
        prerequisiteSceneIds: ["scene-1"],
        characterPresences: [
          { name: "Marie", mode: "physical", location: "atelier de la Ville merveilleuse" },
          { name: "Bastien", mode: "physical", location: "atelier de la Ville merveilleuse" },
        ],
        transition: {
          kind: "ordinary_travel",
          mechanism: "chemin de la maison à l'atelier",
          mechanismId: "walk_to_workshop",
          from: "atelier de la Ville merveilleuse",
          to: "atelier de la Ville merveilleuse",
          characters: ["Marie"],
        },
        objectStates: [],
      },
    ],
  };

  const stabilized = stabilizeStoryScenario(scenario);
  assert.deepEqual(stabilized.scenes[1].transition, {
    kind: "join_travel",
    mechanism: "chemin de la maison à l'atelier",
    mechanismId: "walk_to_workshop",
    from: "maison familiale",
    to: "atelier de la Ville merveilleuse",
    characters: ["Marie"],
  });
  assert.equal(stabilized.scenes[1].locationBefore, "atelier de la Ville merveilleuse");
  assert.equal(stabilized.scenes[1].locationAfter, "atelier de la Ville merveilleuse");
  assert.deepEqual(validateStoryScenario(stabilized), { valid: true, issues: [] });
});

test("join travel rejects moving a resident or hiding an incoming traveler", () => {
  const scenario = {
    title: "L'arrivée",
    summary: "Marie rejoint Bastien.",
    characters: [
      { name: "Bastien", initialLocation: "atelier" },
      { name: "Marie", initialLocation: "maison" },
    ],
    objects: [],
    scenes: [{
      id: "scene-1",
      sceneNumber: 1,
      storyRole: "character_and_desire",
      title: "À l'atelier",
      action: "Marie rejoint Bastien.",
      locationBefore: "atelier",
      locationAfter: "atelier",
      prerequisiteSceneIds: [],
      characterPresences: [{ name: "Bastien", mode: "physical", location: "atelier" }],
      transition: {
        kind: "join_travel",
        mechanism: "chemin",
        mechanismId: "chemin",
        from: "maison",
        to: "atelier",
        characters: ["Bastien", "Marie"],
      },
      objectStates: [],
    }],
  };

  const validation = validateStoryScenario(scenario);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.includes("Bastien cannot depart from maison")));
  assert.ok(validation.issues.some((issue) => issue.includes("Marie travels without being physically present")));
});

test("scenario stabilization infers the discovered portal crossing and its travelers", () => {
  const scenario = coherentPortalScenario();
  scenario.scenes[0].transition.mechanismId = "portail_bleu";
  scenario.scenes[1].transition = {
    kind: "none",
    mechanism: "",
    mechanismId: "",
    from: "la clairiÃ¨re",
    to: "la vallÃ©e des dinosaures",
    characters: [],
  };
  const stabilized = stabilizeStoryScenario(scenario);
  assert.equal(stabilized.scenes[1].transition.kind, "cross_passage");
  assert.equal(stabilized.scenes[1].transition.mechanismId, "portail_bleu");
  assert.equal(stabilized.scenes[1].transition.mechanism, "le portail bleu");
  assert.deepEqual(stabilized.scenes[1].transition.characters, scenario.characters.slice(0, 2).map((character) => character.name));
  assert.equal(validateStoryScenario(stabilized).valid, true);
});

test("stable passage ids allow descriptive wording to change between discovery and crossing", () => {
  const scenario = coherentPortalScenario();
  scenario.scenes[0].transition.mechanismId = "portail_bleu";
  scenario.scenes[1].transition.mechanismId = "portail_bleu";
  scenario.scenes[1].transition.mechanism = "la porte lumineuse entre les arbres";
  assert.equal(validateStoryScenario(scenario).valid, true);
});

test("unchanged suggested clarifications can be accepted with the visible scenario", () => {
  assert.deepEqual(clarificationAnswersForApproval({
    creatorClarifications: {},
    clarifications: [
      { id: "portal_discovery", suggestedAnswer: "Ajouter une scène de découverte avant le passage." },
      { id: "starting_location", suggestedAnswer: "Ils commencent dans la maison familiale." },
    ],
  }), {
    portal_discovery: "Ajouter une scène de découverte avant le passage.",
    starting_location: "Ils commencent dans la maison familiale.",
  });
  assert.equal(clarificationAnswersForApproval({
    clarifications: [{ id: "missing_choice", suggestedAnswer: "" }],
  }), null);
});

test("creator presence choices override the generated scenario exactly", () => {
  const scenario = coherentPortalScenario();
  const edited = applyCreatorStoryScenarioEdits(scenario, {
    addedCharacters: [{ name: "Jérôme" }],
    sceneEdits: [{
      scene_number: 3,
      character_presences: [
        { name: "Nolan", mode: "physical" },
        { name: "Mathéo", mode: "physical" },
        { name: "Alexandra", mode: "thought" },
        { name: "Jérôme", mode: "voice" },
      ],
    }],
  });
  assert.ok(edited.characters.some((character) => character.name === "Jérôme"));
  assert.deepEqual(edited.scenes[2].characterPresences.map(({ name, mode }) => ({ name, mode })), [
    { name: "Nolan", mode: "physical" },
    { name: "Mathéo", mode: "physical" },
    { name: "Alexandra", mode: "thought" },
    { name: "Jérôme", mode: "voice" },
  ]);
});

test("a newly added physical character receives a causal starting location and travels", () => {
  const scenario = coherentPortalScenario();
  const edited = applyCreatorStoryScenarioEdits(scenario, {
    addedCharacters: [{ name: "Lina" }],
    sceneEdits: [{
      scene_number: 2,
      character_presences: [
        { name: "Nolan", mode: "physical" },
        { name: "Mathéo", mode: "physical" },
        { name: "Alexandra", mode: "absent" },
        { name: "Lina", mode: "physical" },
      ],
    }],
  });
  const stabilized = stabilizeStoryScenario(edited);
  assert.equal(stabilized.characters.find((character) => character.name === "Lina").initialLocation, "la clairière");
  assert.deepEqual(stabilized.scenes[1].transition.characters, ["Nolan", "Mathéo", "Lina"]);
  assert.equal(validateStoryScenario(stabilized).valid, true);
});

test("scene contracts tell the illustrator that a held wearable is not also worn", () => {
  const prompt = sceneContractImagePrompt({
    contract: {
      story_beat: "Nolan gathers his courage",
      main_action: { subject: "Nolan", verb: "holds", target: "casquette rouge" },
      object_states: [{ name: "casquette rouge", owner: "Nolan", state: "held", quantity: 1, instruction: "not worn" }],
    },
  });
  assert.match(prompt, /AUTHORITATIVE OBJECT STATES/);
  assert.match(prompt, /held wearable is not also worn/);
  assert.match(prompt, /quantity 1/);
});

test("approved nonphysical characters cannot leak into the visible scene contract", () => {
  const contract = normalizeSceneContract({
    main_action: { subject: "Alexandra", verb: "pose sa main sur", target: "Nolan" },
    named_characters: [
      { name: "Nolan", visual_role: "recipient", action: "Ã©coute" },
      { name: "Alexandra", visual_role: "actor", action: "touche Nolan" },
    ],
  }, {
    spread_number: 4,
    scene_number: 4,
    text_page_number: 9,
    image_page_number: 8,
    prose: "Nolan se souvient des conseils d'Alexandra.",
    planned_image: "",
    planned_cast: ["Nolan"],
    approved_scene: {
      characterPresences: [
        { name: "Nolan", mode: "physical", action: "se souvient" },
        { name: "Alexandra", mode: "memory", action: "conseil passÃ©" },
      ],
      objectStates: [],
    },
  }, [{ name: "Nolan" }, { name: "Alexandra" }]);
  assert.deepEqual(contract.named_characters.map((character) => character.name), ["Nolan"]);
  assert.equal(contract.main_action.subject, "Nolan");
  assert.equal(contract.main_action.target, "");
  assert.match(contract.forbidden_elements.join(" "), /Alexandra is present only as memory/);
});

test("the creator must approve a persisted scenario before the preview route can start", async () => {
  const [previewRoute, scenarioRoute, scenarioGeneration, scenarioWorker, scenarioAgent, scenarioPrompt, app, i18n, html, bridge] = await Promise.all([
    fs.readFile("src/routes/preview.js", "utf8"),
    fs.readFile("src/routes/storyScenario.js", "utf8"),
    fs.readFile("src/services/storyScenarioGeneration.js", "utf8"),
    fs.readFile("src/services/storyScenarioWorker.js", "utf8"),
    fs.readFile("src/agents/storyScenario.js", "utf8"),
    fs.readFile("src/prompts/story_scenario.txt", "utf8"),
    fs.readFile("public/app.js", "utf8"),
    fs.readFile("public/i18n.js", "utf8"),
    fs.readFile("public/index.html", "utf8"),
    fs.readFile("wordpress/calitiki-bridge/calitiki-bridge.php", "utf8"),
  ]);
  assert.match(previewRoute, /storyScenarioRequired\(project\) && !approvedScenario/);
  assert.match(previewRoute, /code: "story_scenario_required"/);
  assert.match(scenarioRoute, /story-scenario\/approve/);
  assert.match(scenarioRoute, /validateStoryScenario\(scenario\)/);
  assert.match(scenarioRoute, /clarificationAnswersForApproval\(scenario\)/);
  assert.match(scenarioRoute, /const previousProjectStatus = project\.status/);
  assert.match(scenarioRoute, /previousProjectStatus,\s*technicalAttempt/);
  assert.match(scenarioRoute, /clarifications: \[\]/);
  assert.match(scenarioAgent, /bookLanguageInstruction\(language\)/);
  assert.match(scenarioAgent, /normalizeBookLanguage\(input\?\.intake\?\.language\)/);
  assert.match(scenarioPrompt, /Never ask the creator to confirm a repair already dictated by the causal rules/);
  assert.match(scenarioPrompt, /Write every creator-facing value exclusively in intake\.language/);
  assert.match(scenarioPrompt, /character_movements is the authoritative per-character travel ledger/);
  assert.match(scenarioPrompt, /phase start for a departure/);
  assert.match(scenarioPrompt, /causal_graph\.version 2 is the only mechanical source of truth/);
  assert.match(scenarioPrompt, /Do not return objects\[\]\.owner/);
  assert.doesNotMatch(scenarioPrompt, /"object_states": \[/);
  assert.match(app, /requestStoryScenario/);
  assert.match(app, /approveStoryScenario/);
  assert.match(app, /storyScenarioBusy/);
  assert.match(app, /scenarioApiMessage/);
  assert.match(app, /if \(payload\.scenario\) \{/);
  assert.match(app, /showInitialScenarioPreparation/);
  assert.match(app, /const initialRequest = !state\.storyScenario && !includeEdits/);
  assert.match(app, /setStoryScenarioBusy\(true, initialRequest \? "prepare" : "update"\)/);
  assert.match(app, /elements\.scenarioReviewContent\.hidden = true/);
  assert.match(app, /elements\.scenarioReviewContent\.hidden = false/);
  assert.match(app, /pollStoryScenarioJob/);
  assert.match(app, /scenario_timeout/);
  assert.match(app, /elements\.retryInitialScenarioButton\.hidden = !state\.storyScenarioRetryAvailable/);
  assert.match(app, /copy\.exhausted/);
  assert.match(app, /scenarioNeedsRevision/);
  assert.match(app, /scenarioHasUnansweredClarifications/);
  assert.match(app, /scenarioDefaultsReady/);
  assert.doesNotMatch(app, /escapeHtml\(scene\.storyRole\)/);
  assert.match(i18n, /scenarioDefaultsReady: "Les réponses proposées sont déjà appliquées au scénario/);
  assert.match(app, /data-presence-character/);
  assert.match(app, /storyScenarioDirty/);
  assert.match(app, /addedCharacters: state\.storyScenarioAddedCharacters/);
  assert.match(scenarioGeneration, /applyCreatorStoryScenarioEdits/);
  assert.match(scenarioRoute, /character_presences/);
  assert.doesNotMatch(app, /\.\.\.\(payload\.issues \|\| \[\]\)/);
  assert.match(html, /id="storyScenarioPanel"/);
  assert.match(html, /id="scenarioPreparingState"/);
  assert.match(html, /id="scenarioCreationJourney"/);
  assert.match(html, /id="scenarioPreparingSteps"/);
  assert.match(html, /id="notifyScenarioEmail"/);
  assert.match(html, /id="notifyScenarioEmail" data-allow-during-busy/);
  assert.match(app, /input:not\(\[data-allow-during-busy\]\)/);
  assert.match(html, /id="retryInitialScenarioButton"/);
  assert.match(html, /id="scenarioReviewContent"/);
  assert.match(html, /id="scenarioStatus"/);
  assert.match(html, /id="scenarioDiagnostics"/);
  assert.match(html, /id="scenarioNewCharacterName"/);
  assert.match(html, /id="scenarioAddCharacterButton"/);
  assert.match(scenarioRoute, /kind: "story_scenario"/);
  assert.match(scenarioRoute, /status: "scenario_generating"/);
  assert.match(scenarioRoute, /storyScenarioGeneration/);
  assert.match(scenarioWorker, /claimNextRun/);
  assert.match(scenarioWorker, /heartbeatRun/);
  assert.match(scenarioWorker, /retryAvailable/);
  assert.match(scenarioWorker, /retryExhausted/);
  assert.match(scenarioWorker, /event: "scenario_ready"/);
  assert.match(scenarioWorker, /event: "scenario_failed"/);
  assert.match(app, /if \(error\?\.technical\) \{\s*await showGenerationFailure\(\)/);
  assert.match(scenarioRoute, /MAX_TECHNICAL_ATTEMPTS = 2/);
  assert.match(scenarioRoute, /activeScenarioEnqueues/);
  assert.doesNotMatch(scenarioRoute, /res\.status\([^)]*\)\.json\(\{[^}]*issues:/s);
  assert.match(bridge, /Version: 0\.7\.5/);
  assert.match(bridge, /scenario_generating/);
  assert.match(bridge, /Scénario à valider/);
});
