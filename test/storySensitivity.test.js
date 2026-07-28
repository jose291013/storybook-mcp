import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  STORY_SENSITIVITY_PROFILE_VERSION,
  assessStorySensitivity,
  deterministicStorySensitivity,
  observeStorySensitivity,
  sanitizeSensitivityQuestionnaire,
  storySensitivityMode,
} from "../src/services/storySensitivity.js";
import { normalizeBookRequest } from "../src/services/normalizeBookRequest.js";

test("deterministic sensitivity floor recognizes representative FR, ES and EN wording", () => {
  const cases = [
    ["FR everyday", "Il se décourage quand un dessin n'est pas parfait.", 1, false],
    ["FR emotional", "Elle vit du harcèlement à l'école.", 2, false],
    ["FR major", "Nous traversons le deuil de sa grand-mère.", 3, false],
    ["ES emotional", "Le preocupa una mudanza y dejar a sus amigos.", 2, false],
    ["ES major", "Quiere hablar del fallecimiento de su abuelo.", 3, false],
    ["EN emotional", "He is coping with bullying at school.", 2, false],
    ["EN major", "The family is facing a terminal illness.", 3, false],
    ["EN restricted", "There is immediate danger and self-harm.", 3, true],
  ];

  for (const [name, creatorSituation, level, restricted] of cases) {
    const profile = deterministicStorySensitivity({ creatorSituation });
    assert.equal(profile.level, level, name);
    assert.equal(profile.restricted, restricted, name);
    assert.equal(profile.version, STORY_SENSITIVITY_PROFILE_VERSION, name);
  }
});

test("critical deterministic floor tolerates natural spacing, accents and common misspellings", () => {
  const cases = [
    ["FR spaced self-harm", "Nolan s'auto mutile lorsque quelque chose le contrarie."],
    ["FR self-injury", "Il se renferme et nous avons remarqué des auto lésions sur ses bras."],
    ["FR misspelled suicide", "Un ami raconte qu'il parle de sucide."],
    ["ES self-injury", "Se autolesiona cuando algo le contraría."],
    ["ES suicide", "Ha hablado de suicidio con un amigo."],
    ["EN hyphenated self-harm", "The child is showing signs of self-harm."],
    ["EN self-injury", "The child has repeated self injury marks."],
  ];

  for (const [name, creatorSituation] of cases) {
    const profile = deterministicStorySensitivity({ creatorSituation });
    assert.equal(profile.level, 3, name);
    assert.equal(profile.category, "acute_safety", name);
    assert.equal(profile.restricted, true, name);
    assert.equal(profile.needs_clarification, true, name);
  }
});

test("critical deterministic floor overrides a classifier that misses acute safety", async () => {
  const cases = [
    "Nolan s'auto mutile lorsque quelque chose le contrarie.",
    "Nolan reçoit bulling à l'école et un ami raconte qu'il parle de sucide.",
    "Il se renferme et nous avons remarqué des auto lésions sur ses bras.",
  ];

  for (const creatorSituation of cases) {
    for (const childAge of [6, 9, 12]) {
      const profile = await assessStorySensitivity({
        creatorSituation,
        childAge,
        locale: "FR",
      }, {
        runAgent: async () => ({
          level: 1,
          category: "everyday_challenge",
          restricted: false,
          needs_clarification: false,
          confidence: "low",
        }),
      });

      assert.equal(profile.level, 3);
      assert.equal(profile.category, "acute_safety");
      assert.equal(profile.restricted, true);
    }
  }
});

test("critical deterministic floor survives provider failure and avoids nearby false positives", async () => {
  const fallback = await observeStorySensitivity({
    creatorSituation: "Un ami raconte qu'il parle de sucide.",
    childAge: 9,
    locale: "FR",
  }, {
    mode: "observe",
    timeoutMs: 1000,
    runAgent: async () => { throw new Error("provider unavailable"); },
  });

  assert.equal(fallback.level, 3);
  assert.equal(fallback.category, "acute_safety");
  assert.equal(fallback.restricted, true);
  assert.equal(fallback.source, "deterministic_fallback");

  const controls = [
    ["haircut", "Il se coupe les cheveux avant l'école.", 1],
    ["accidental injury", "Il s'est blessé accidentellement au football.", 1],
    ["withdrawal", "Il se renferme quand une activité lui semble difficile.", 1],
    ["misspelled bullying", "Il reçoit du bulling à l'école.", 2],
    ["bereavement", "La famille traverse le deuil de sa grand-mère.", 3],
  ];

  for (const [name, creatorSituation, level] of controls) {
    const profile = deterministicStorySensitivity({ creatorSituation });
    assert.equal(profile.level, level, name);
    assert.equal(profile.restricted, false, name);
  }
});

test("observation trace separates deterministic and classifier decisions without private text", async () => {
  let trace = null;
  const profile = await assessStorySensitivity({
    creatorSituation: "Nolan s'auto mutile lorsqu'il est contrarié.",
    childAge: 6,
    locale: "FR",
  }, {
    onTrace: (value) => {
      trace = value;
    },
    runAgent: async () => ({
      level: 2,
      category: "emotional_challenge",
      restricted: false,
      needs_clarification: false,
      confidence: "medium",
    }),
  });

  assert.equal(profile.restricted, true);
  assert.deepEqual(trace, {
    deterministicLevel: 3,
    deterministicRestricted: true,
    classifierLevel: 2,
    classifierRestricted: false,
    finalLevel: 3,
    finalRestricted: true,
  });
  assert.doesNotMatch(JSON.stringify(trace), /Nolan|contrari/i);
});

test("hybrid sensitivity can raise but never lower the deterministic floor", async () => {
  const profile = await assessStorySensitivity({
    creatorSituation: "Nous traversons le deuil de sa grand-mère.",
    childAge: 8,
    locale: "FR",
  }, {
    runAgent: async () => ({
      level: 1,
      category: "everyday_challenge",
      restricted: false,
      needs_clarification: false,
      confidence: "low",
    }),
  });

  assert.equal(profile.level, 3);
  assert.equal(profile.category, "major_life_event");
  assert.equal(profile.restricted, false);
  assert.equal(profile.source, "hybrid");

  const restricted = await assessStorySensitivity({
    creatorSituation: "A situation that needs careful review.",
    childAge: 8,
    locale: "EN",
  }, {
    runAgent: async () => ({
      level: 1,
      category: "acute_safety",
      restricted: true,
      needs_clarification: true,
      confidence: "high",
    }),
  });
  assert.equal(restricted.level, 3);
  assert.equal(restricted.category, "acute_safety");
  assert.equal(restricted.restricted, true);
});

test("observation is off by default and fails open to deterministic metadata", async () => {
  assert.equal(storySensitivityMode("unexpected"), "off");
  assert.equal(await observeStorySensitivity({
    creatorSituation: "She is coping with bullying.",
    childAge: 9,
    locale: "EN",
  }, {
    mode: "off",
    runAgent: async () => { throw new Error("must not be called"); },
  }), null);

  let observedError = "";
  const fallback = await observeStorySensitivity({
    creatorSituation: "She is coping with bullying.",
    childAge: 9,
    locale: "EN",
  }, {
    mode: "observe",
    timeoutMs: 1000,
    runAgent: async () => { throw new Error("provider unavailable"); },
    onError: (error) => { observedError = error.message; },
  });

  assert.equal(fallback.level, 2);
  assert.equal(fallback.source, "deterministic_fallback");
  assert.match(observedError, /provider unavailable/);
});

test("only the versioned private profile is persisted and it stays outside narrative answers", () => {
  const questionnaire = sanitizeSensitivityQuestionnaire({
    hero_name: "Lina",
    age: "8",
    universe_id: "coral_ocean",
    story_sensitivity_profile: {
      version: 99,
      level: 2,
      category: "emotional_challenge",
      restricted: false,
      needs_clarification: true,
      confidence: "high",
      recommended_approach: "untrusted",
      source: "untrusted",
      rationale: "private text that must not be persisted",
      creator_situation: "must not be copied",
    },
  });

  assert.deepEqual(questionnaire.story_sensitivity_profile, {
    version: STORY_SENSITIVITY_PROFILE_VERSION,
    level: 2,
    category: "emotional_challenge",
    restricted: false,
    needs_clarification: true,
    confidence: "high",
    recommended_approach: "gentle_action_led",
    source: "hybrid",
  });

  const normalized = normalizeBookRequest({ questionnaire });
  assert.equal("story_sensitivity_profile" in normalized.answers, false);

  const cannotBeLoweredAtPersistence = sanitizeSensitivityQuestionnaire({
    creator_situation: "Nous traversons le deuil de sa grand-mère.",
    story_sensitivity_profile: { level: 1, restricted: false },
  });
  assert.equal(cannotBeLoweredAtPersistence.story_sensitivity_profile.level, 3);
});

test("persisted version-1 observations remain unchanged when the version-2 floor is deployed", () => {
  const questionnaire = sanitizeSensitivityQuestionnaire({
    creator_situation: "Nolan s'auto mutile lorsqu'il est contrarié.",
    story_sensitivity_profile: {
      version: 1,
      level: 1,
      category: "everyday_challenge",
      restricted: false,
      needs_clarification: false,
      confidence: "medium",
      source: "hybrid",
    },
  });

  assert.equal(questionnaire.story_sensitivity_profile.version, 1);
  assert.equal(questionnaire.story_sensitivity_profile.level, 1);
  assert.equal(questionnaire.story_sensitivity_profile.restricted, false);

  const current = sanitizeSensitivityQuestionnaire({
    creator_situation: "Nolan s'auto mutile lorsqu'il est contrarié.",
    story_sensitivity_profile: {
      level: 1,
      restricted: false,
      needs_clarification: false,
      confidence: "low",
    },
  });
  assert.equal(current.story_sensitivity_profile.version, STORY_SENSITIVITY_PROFILE_VERSION);
  assert.equal(current.story_sensitivity_profile.level, 3);
  assert.equal(current.story_sensitivity_profile.restricted, true);
});

test("creator and route retain sensitivity observation without displaying or enforcing it", async () => {
  const [app, route, scenarioPrompt, textPrompt] = await Promise.all([
    fs.readFile("public/app.js", "utf8"),
    fs.readFile("src/routes/storyIntentions.js", "utf8"),
    fs.readFile("src/prompts/story_scenario.txt", "utf8"),
    fs.readFile("src/prompts/text_writer.txt", "utf8"),
  ]);

  assert.match(app, /storySensitivityProfile: null/);
  assert.match(app, /story_sensitivity_profile: state\.storySensitivityProfile/);
  assert.match(app, /state\.storySensitivityProfile = payload\.sensitivityProfile \|\| null/);
  assert.match(route, /observeStorySensitivity/);
  assert.match(route, /res\.json\(\{\s*intentions,/);
  assert.match(route, /deterministicLevel/);
  assert.match(route, /classifierRestricted/);
  assert.doesNotMatch(scenarioPrompt, /story_sensitivity_profile/);
  assert.doesNotMatch(textPrompt, /story_sensitivity_profile/);
});
