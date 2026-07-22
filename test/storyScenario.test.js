import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { sceneContractImagePrompt } from "../src/agents/storyScenePlanner.js";
import { validateStoryScenario } from "../src/services/storyScenario.js";

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
  const [previewRoute, scenarioRoute, app, html, bridge] = await Promise.all([
    fs.readFile("src/routes/preview.js", "utf8"),
    fs.readFile("src/routes/storyScenario.js", "utf8"),
    fs.readFile("public/app.js", "utf8"),
    fs.readFile("public/index.html", "utf8"),
    fs.readFile("wordpress/calitiki-bridge/calitiki-bridge.php", "utf8"),
  ]);
  assert.match(previewRoute, /storyScenarioRequired\(project\) && !approvedScenario/);
  assert.match(previewRoute, /code: "story_scenario_required"/);
  assert.match(scenarioRoute, /story-scenario\/approve/);
  assert.match(scenarioRoute, /validateStoryScenario\(scenario\)/);
  assert.match(app, /requestStoryScenario/);
  assert.match(app, /approveStoryScenario/);
  assert.match(html, /id="storyScenarioPanel"/);
  assert.match(bridge, /Version: 0\.6\.2/);
  assert.match(bridge, /Scénario à valider/);
});
