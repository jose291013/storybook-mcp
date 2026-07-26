import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { normalizeSceneContract, sceneContractImagePrompt } from "../src/agents/storyScenePlanner.js";
import { deterministicStoryPlanIssues } from "../src/agents/storyScenePlanAudit.js";
import { buildStorySceneTextRepairTargets, sanitizeStoryRepairText } from "../src/agents/storySceneTextRepair.js";
import { applyCreatorStoryScenarioEdits, clarificationAnswersForApproval, normalizeStoryScenario, stabilizeStoryScenario, summarizeStoryScenarioValidation, validateStoryScenario } from "../src/services/storyScenario.js";
import { applyStoryScenarioRepairDirectives, buildStoryScenarioRepairDirectives } from "../src/services/storyScenarioRepairs.js";

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
  assert.equal(validateStoryScenario(modern).valid, true);

  const legacy = coherentPortalScenario();
  assert.equal(legacy.narrativeContract, undefined);
  assert.equal(validateStoryScenario(legacy).valid, true);
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
  assert.ok(validation.issues.some((issue) => issue.includes("Marie joins the scene without being physically present")));
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
  const [previewRoute, scenarioRoute, scenarioAgent, scenarioPrompt, app, i18n, html, bridge] = await Promise.all([
    fs.readFile("src/routes/preview.js", "utf8"),
    fs.readFile("src/routes/storyScenario.js", "utf8"),
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
  assert.match(scenarioRoute, /clarifications: \[\]/);
  assert.match(scenarioAgent, /bookLanguageInstruction\(language\)/);
  assert.match(scenarioAgent, /normalizeBookLanguage\(input\?\.intake\?\.language\)/);
  assert.match(scenarioPrompt, /Never ask the creator to confirm a repair already dictated by the causal rules/);
  assert.match(scenarioPrompt, /Write every creator-facing value exclusively in intake\.language/);
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
  assert.match(app, /elements\.scenarioPreparationFeedback\.textContent = copy\.error/);
  assert.match(app, /elements\.retryInitialScenarioButton\.hidden = false/);
  assert.match(app, /scenarioNeedsRevision/);
  assert.match(app, /scenarioHasUnansweredClarifications/);
  assert.match(app, /scenarioDefaultsReady/);
  assert.doesNotMatch(app, /escapeHtml\(scene\.storyRole\)/);
  assert.match(i18n, /scenarioDefaultsReady: "Les réponses proposées sont déjà appliquées au scénario/);
  assert.match(app, /data-presence-character/);
  assert.match(app, /storyScenarioDirty/);
  assert.match(app, /addedCharacters: state\.storyScenarioAddedCharacters/);
  assert.match(scenarioRoute, /applyCreatorStoryScenarioEdits/);
  assert.match(scenarioRoute, /character_presences/);
  assert.doesNotMatch(app, /\.\.\.\(payload\.issues \|\| \[\]\)/);
  assert.match(html, /id="storyScenarioPanel"/);
  assert.match(html, /id="scenarioPreparingState"/);
  assert.match(html, /id="scenarioPreparingSteps"/);
  assert.match(html, /id="retryInitialScenarioButton"/);
  assert.match(html, /id="scenarioReviewContent"/);
  assert.match(html, /id="scenarioStatus"/);
  assert.match(html, /id="scenarioDiagnostics"/);
  assert.match(html, /id="scenarioNewCharacterName"/);
  assert.match(html, /id="scenarioAddCharacterButton"/);
  assert.match(scenarioRoute, /activeScenarioUpdates/);
  assert.match(scenarioRoute, /code: "scenario_update_in_progress"/);
  assert.match(scenarioRoute, /scenario: storedScenario/);
  assert.match(scenarioRoute, /status: "scenario_review"/);
  assert.doesNotMatch(scenarioRoute, /res\.status\([^)]*\)\.json\(\{[^}]*issues:/s);
  assert.match(bridge, /Version: 0\.7\.0/);
  assert.match(bridge, /Scénario à valider/);
});
