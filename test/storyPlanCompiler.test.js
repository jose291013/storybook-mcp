import test from "node:test";
import assert from "node:assert/strict";

import { deterministicStoryPlanIssues } from "../src/agents/storyScenePlanAudit.js";
import {
  classifyStoryPlanIssues,
  compileStoryPlan,
  STORY_PLAN_COMPILER_VERSION,
} from "../src/services/storyPlanCompiler.js";

const canonicalCharacters = [
  { name: "Bastien", role: "child", relationship: "hero" },
  { name: "Marie", role: "guide", relationship: "mère", preferredAddress: "Maman" },
  { name: "Paul", role: "adult", relationship: "friend" },
];

test("structured speech uses the family address only for the child speaker", () => {
  const compiled = compileStoryPlan({
    pageTexts: {
      18: "Marie sourit. « Marie, regarde les oiseaux ! », dit Bastien. « Marie arrive demain », dit Paul.",
    },
    speechSegmentsByPage: {
      18: [
        { speaker: "Bastien", mode: "dialogue", text: "Marie, regarde les oiseaux !" },
        { speaker: "Paul", mode: "dialogue", text: "Marie arrive demain" },
      ],
    },
    sceneContracts: [{ scene_number: 9, text_page_number: 18 }],
  }, {
    canonicalCharacters,
    heroName: "Bastien",
    language: "FR",
  });

  assert.equal(
    compiled.pageTexts[18],
    "Marie sourit. « Maman, regarde les oiseaux ! », dit Bastien. « Marie arrive demain », dit Paul.",
  );
  assert.equal(compiled.speechSegmentsByPage[18][0].text, "Maman, regarde les oiseaux !");
  assert.equal(compiled.speechSegmentsByPage[18][1].text, "Marie arrive demain");
  assert.equal(compiled.compiler.version, STORY_PLAN_COMPILER_VERSION);
  assert.deepEqual(compiled.compiler.changedPages, [18]);
});

test("an auditor family-address issue deterministically repairs the saved legacy candidate", () => {
  const issue = {
    sceneNumber: 9,
    code: "parent_first_name_in_dialogue",
    explanation: "Use Maman in Bastien's dialogue.",
  };
  const plan = {
    pageTexts: {
      18: "Marie reste dans son souvenir. « Marie aimait écouter les oiseaux avec moi », se souvient Bastien.",
    },
    sceneContracts: [{
      scene_number: 9,
      text_page_number: 18,
      named_characters: [{ name: "Bastien" }],
    }],
  };
  const compiled = compileStoryPlan(plan, {
    canonicalCharacters,
    heroName: "Bastien",
    language: "FR",
    issues: [issue],
  });

  assert.equal(
    compiled.pageTexts[18],
    "Marie reste dans son souvenir. « Maman aimait écouter les oiseaux avec moi », se souvient Bastien.",
  );
  assert.deepEqual(compiled.compiler.unresolvedIssueKeys, []);

  const deterministicIssues = deterministicStoryPlanIssues({
    approvedScenario: {
      characters: canonicalCharacters,
      scenes: [{
        sceneNumber: 9,
        characterPresences: [
          { name: "Bastien", mode: "physical" },
          { name: "Marie", mode: "memory" },
        ],
      }],
    },
    pageTexts: compiled.pageTexts,
    sceneContracts: compiled.sceneContracts,
    canonicalCharacters,
    language: "FR",
  });
  assert.deepEqual(deterministicIssues, []);

  const compiledAgain = compileStoryPlan(compiled, {
    canonicalCharacters,
    heroName: "Bastien",
    language: "FR",
    issues: [issue],
  });
  assert.equal(compiledAgain.pageTexts[18], compiled.pageTexts[18]);
  assert.equal(compiledAgain.compiler.replacements, 0);
});

test("issue classification keeps mechanical family wording out of creative repair", () => {
  const classified = classifyStoryPlanIssues([
    { sceneNumber: 9, code: "family_address" },
    { sceneNumber: 11, code: "mixed_crossing_moments" },
  ]);
  assert.deepEqual(classified.autoFixable.map((issue) => issue.code), ["family_address"]);
  assert.deepEqual(classified.creative.map((issue) => issue.code), ["mixed_crossing_moments"]);
});

test("structured speaker metadata makes family-address validation deterministic", () => {
  const issues = deterministicStoryPlanIssues({
    approvedScenario: {
      characters: canonicalCharacters,
      scenes: [{
        sceneNumber: 9,
        characterPresences: [
          { name: "Bastien", mode: "physical" },
          { name: "Marie", mode: "memory" },
        ],
      }],
    },
    pageTexts: {
      18: "« Marie aimait écouter les oiseaux avec moi », se souvient Bastien.",
    },
    speechSegmentsByPage: {
      18: [{ speaker: "Bastien", mode: "dialogue", text: "Marie aimait écouter les oiseaux avec moi" }],
    },
    sceneContracts: [{
      scene_number: 9,
      text_page_number: 18,
      named_characters: [{ name: "Bastien" }],
    }],
    canonicalCharacters,
    language: "FR",
  });
  assert.ok(issues.some((issue) => issue.code === "family_address"));
});
