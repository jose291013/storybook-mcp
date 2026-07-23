import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { sceneContractImagePrompt } from "../src/agents/storyScenePlanner.js";
import { applyCreatorStoryScenarioEdits, clarificationAnswersForApproval, normalizeStoryScenario, stabilizeStoryScenario, summarizeStoryScenarioValidation, validateStoryScenario } from "../src/services/storyScenario.js";

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
  assert.match(app, /if \(initialRequest\) \{[\s\S]*throw error;/);
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
  assert.match(bridge, /Version: 0\.6\.7/);
  assert.match(bridge, /Scénario à valider/);
});
