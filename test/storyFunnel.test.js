import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { UNIVERSE_OPTIONS } from "../src/config/bookOptions.js";
import { normalizeStorySuggestions } from "../src/services/storySuggestions.js";
import { normalizeBookRequest } from "../src/services/normalizeBookRequest.js";

test("every universe has a likeness example and a causal story contract", async () => {
  assert.equal(UNIVERSE_OPTIONS.length, 6);
  for (const universe of UNIVERSE_OPTIONS) {
    assert.match(universe.previewImage, /-likeness\.webp$/);
    assert.ok(universe.referenceImage);
    assert.ok(universe.storyContract?.adventureZone);
    assert.ok(universe.storyContract?.entryRule);
    assert.ok(Array.isArray(universe.storyContract?.physicalRules));
    assert.ok(Array.isArray(universe.storyContract?.requiredMechanisms));
    await fs.access(`public${universe.previewImage}`);
    await fs.access(`public${universe.referenceImage}`);
  }
});

test("story suggestions require all three distinct inspiration lanes", () => {
  const complete = normalizeStorySuggestions({ suggestions: [
    { id: "creation", title: "C", dream: "d", challenge: "c", adventure: "a", moment: "m", transformation: "t" },
    { id: "teamwork", title: "T", dream: "d", challenge: "c", adventure: "a", moment: "m", transformation: "t" },
    { id: "discovery", title: "D", dream: "d", challenge: "c", adventure: "a", moment: "m", transformation: "t" },
  ] });
  assert.deepEqual(complete.map((suggestion) => suggestion.id), ["teamwork", "discovery", "creation"]);
  assert.equal(normalizeStorySuggestions({ suggestions: complete.slice(0, 2) }).length, 2);
});

test("normalized intake locks the selected universe contract and story seed", () => {
  const normalized = normalizeBookRequest({ questionnaire: {
    hero_name: "Lina",
    age: "7",
    universe_id: "coral_ocean",
    story_seed_id: "discovery",
    story_seed_title: "Le jardin des voix",
    story_seed_adaptation: "Lina suit une mélodie dans le récif.",
    story_seed_moment: "Elle ouvre le passage.",
    story_seed_transformation: "Elle ose demander de l'aide.",
  } });
  assert.equal(normalized.answers.story_seed_id, "discovery");
  assert.equal(normalized.answers.story_seed_title, "Le jardin des voix");
  assert.match(normalized.answers.universe_story_contract.id, /coral_ocean/);
  assert.ok(normalized.answers.universe_story_contract.requiredMechanisms.length);
});

test("the creator exposes the seven-step universe-first funnel", async () => {
  const [html, app, route, auditPrompt] = await Promise.all([
    fs.readFile("public/index.html", "utf8"),
    fs.readFile("public/app.js", "utf8"),
    fs.readFile("src/routes/storySuggestions.js", "utf8"),
    fs.readFile("src/prompts/story_scenario_audit.txt", "utf8"),
  ]);
  assert.equal((html.match(/data-panel="/g) || []).length, 7);
  assert.match(html, /data-panel="0"[\s\S]*id="universeGrid"/);
  assert.match(html, /data-panel="2"[\s\S]*id="storySuggestionGrid"/);
  assert.match(html, /id="scenarioWorldContract"/);
  assert.match(app, /const STEP_COUNT = 7/);
  assert.match(app, /requestStorySuggestions/);
  assert.match(app, /universe_story_contract/);
  assert.match(app, /const message = document\.querySelector\("#message"\);[\s\S]*message\.value = suggestion\.transformation/);
  assert.match(route, /MAX_ATTEMPTS = 6/);
  assert.match(auditPrompt, /universe_story_contract/);
  assert.match(auditPrompt, /merely decorative/);
});
