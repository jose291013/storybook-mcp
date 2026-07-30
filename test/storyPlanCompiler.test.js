import test from "node:test";
import assert from "node:assert/strict";

import {
  authoritativeSceneContractForAudit,
  deterministicStoryPlanIssues,
  STORY_PLAN_AUDIT_CONTRACT_VERSION,
} from "../src/agents/storyScenePlanAudit.js";
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

test("the plan audit sees only the contract that image generation can render", () => {
  const contract = authoritativeSceneContractForAudit({
    spread_number: 2,
    scene_number: 3,
    text_page_number: 6,
    image_page_number: 7,
    story_beat: "Noa holds the doll in her arms.",
    source_prose: "An earlier manuscript version.",
    planned_image_context: "Noa holds the doll in her arms at the dock.",
    main_action: {
      subject: "Noa",
      verb: "walks",
      target: "toward the protected dock",
    },
    named_characters: [{
      name: "Noa",
      entity_type: "human child",
      visual_role: "hero",
      action: "walks toward the dock",
    }],
    object_states: [{
      name: "single doll",
      owner: "Noa",
      state: "secured",
      quantity: 1,
      instruction: "secured in Noa's closed band, not in her arms",
    }],
    forbidden_elements: ["the doll in Noa's arms"],
    continuity_from_previous: "An earlier non-rendered planning note.",
    continuity_to_next: "Another non-rendered planning note.",
  });

  assert.equal(contract.audit_contract_version, STORY_PLAN_AUDIT_CONTRACT_VERSION);
  assert.equal(contract.story_beat, undefined);
  assert.equal(contract.source_prose, undefined);
  assert.equal(contract.planned_image_context, undefined);
  assert.equal(contract.continuity_from_previous, undefined);
  assert.equal(contract.continuity_to_next, undefined);
  assert.equal(contract.object_states[0].instruction, "secured in Noa's closed band, not in her arms");
  assert.equal(JSON.stringify(contract).includes("holds the doll in her arms at the dock"), false);
});

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

test("a saved free-form audit code is recognized from the canonical family contract", () => {
  const classified = classifyStoryPlanIssues([{
    sceneNumber: 9,
    code: "preferred_relationship_wording",
    explanation: "Dans le dialogue de Bastien, remplacer « Marie aimait écouter les oiseaux avec moi » par une formulation utilisant « Maman », son adresse préférée.",
  }], {
    canonicalCharacters,
    language: "FR",
  });

  assert.equal(classified.autoFixable.length, 1);
  assert.equal(classified.autoFixable[0].code, "family_address");
  assert.equal(classified.autoFixable[0].originalCode, "preferred_relationship_wording");
  assert.deepEqual(classified.creative, []);
});

test("the saved legacy audit repairs one unattributed family quote without changing narration", () => {
  const compiled = compileStoryPlan({
    pageTexts: {
      18: "Marie reste dans son souvenir. « Marie aimait écouter les oiseaux avec moi ».",
    },
    sceneContracts: [{ scene_number: 9, text_page_number: 18 }],
  }, {
    canonicalCharacters,
    heroName: "Bastien",
    language: "FR",
    issues: [{
      sceneNumber: 9,
      code: "preferred_relationship_wording",
      explanation: "Dans le dialogue de Bastien, remplacer Marie par Maman, son adresse préférée.",
    }],
  });

  assert.equal(
    compiled.pageTexts[18],
    "Marie reste dans son souvenir. « Maman aimait écouter les oiseaux avec moi ».",
  );
  assert.deepEqual(compiled.compiler.unresolvedIssueKeys, []);
});

test("issue-scoped legacy repair leaves ambiguous adult dialogue unchanged", () => {
  const original = "« Marie arrive demain », dit Paul. « Marie écoute les oiseaux », murmure Luc.";
  const compiled = compileStoryPlan({
    pageTexts: { 18: original },
    sceneContracts: [{ scene_number: 9, text_page_number: 18 }],
  }, {
    canonicalCharacters,
    heroName: "Bastien",
    language: "FR",
    issues: [{
      sceneNumber: 9,
      code: "parent_dialogue_address",
      explanation: "Use Maman instead of Marie in the child's dialogue.",
    }],
  });

  assert.equal(compiled.pageTexts[18], original);
  assert.deepEqual(compiled.compiler.unresolvedIssueKeys, ["9:family_address"]);
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
