import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStoryCastParticipationContract,
  storyCastParticipationSummary,
  validateStoryCastParticipation,
} from "../src/services/storyCastParticipation.js";

test("creator photo roles become explicit story participation requirements", () => {
  const contract = buildStoryCastParticipationContract([
    { name: "Noa", storyRole: "hero" },
    { name: "Kovu", storyRole: "companion" },
    { name: "Antonio", storyRole: "guide" },
    { name: "Eva", storyRole: "supporter" },
  ], 11);

  assert.deepEqual(contract.participants.map((participant) => ({
    name: participant.name,
    meaningful: participant.minimumMeaningfulScenes,
    physical: participant.minimumPhysicalScenes,
  })), [
    { name: "Noa", meaningful: 1, physical: 1 },
    { name: "Kovu", meaningful: 3, physical: 2 },
    { name: "Antonio", meaningful: 2, physical: 0 },
    { name: "Eva", meaningful: 2, physical: 1 },
  ]);
});

test("a scenario cannot silently omit a selected companion, guide or supporter", () => {
  const scenario = {
    castParticipationContract: buildStoryCastParticipationContract([
      { name: "Noa", storyRole: "hero" },
      { name: "Kovu", storyRole: "companion" },
      { name: "Antonio", storyRole: "guide" },
      { name: "Eva", storyRole: "supporter" },
    ], 11),
    scenes: [{
      sceneNumber: 1,
      characterPresences: [{ name: "Noa", mode: "physical", action: "commence l'aventure" }],
    }],
  };

  const issues = validateStoryCastParticipation(scenario);
  assert.ok(issues.some((issue) => issue.includes("Kovu (companion)")));
  assert.ok(issues.some((issue) => issue.includes("Antonio (guide)")));
  assert.ok(issues.some((issue) => issue.includes("Eva (supporter)")));
});

test("a guide may help through thought while physical companions remain visible", () => {
  const scenario = {
    castParticipationContract: buildStoryCastParticipationContract([
      { name: "Noa", storyRole: "hero" },
      { name: "Kovu", storyRole: "companion" },
      { name: "Antonio", storyRole: "guide" },
    ], 3),
    scenes: [
      { sceneNumber: 1, characterPresences: [
        { name: "Noa", mode: "physical", action: "essaie" },
        { name: "Kovu", mode: "physical", action: "cherche avec Noa" },
        { name: "Antonio", mode: "voice", action: "rappelle un conseil" },
      ] },
      { sceneNumber: 2, characterPresences: [
        { name: "Kovu", mode: "physical", action: "encourage Noa" },
        { name: "Antonio", mode: "thought", action: "guide sa réflexion" },
      ] },
      { sceneNumber: 3, characterPresences: [
        { name: "Kovu", mode: "physical", action: "célèbre la réussite" },
      ] },
    ],
  };

  assert.deepEqual(validateStoryCastParticipation(scenario), []);
  assert.deepEqual(storyCastParticipationSummary(scenario)[1].sceneNumbers, [1, 2, 3]);
  assert.deepEqual(storyCastParticipationSummary(scenario)[2].physicalSceneNumbers, []);
});

test("legacy scenarios without the new contract remain readable", () => {
  assert.deepEqual(validateStoryCastParticipation({ scenes: [] }), []);
});
