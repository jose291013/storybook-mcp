import test from "node:test";
import assert from "node:assert/strict";

import {
  authoritativeSceneContractForAudit,
  deterministicStoryPlanIssues,
  STORY_PLAN_AUDIT_CONTRACT_VERSION,
  versionedStoryPlanAuditStep,
} from "../src/agents/storyScenePlanAudit.js";
import {
  normalizeSceneContract,
  storyPlanRepairEnvelope,
} from "../src/agents/storyScenePlanner.js";
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

test("targeted repair receives one normalized previous plan and authoritative scene targets", () => {
  const envelope = storyPlanRepairEnvelope({
    previousPlan: {
      pageTexts: { 16: "Eva demande une pause." },
      speechSegmentsByPage: {
        16: [{ speaker: "Eva", mode: "dialogue", text: "J'ai besoin d'une pause." }],
      },
      sceneContracts: [{ scene_number: 8, text_page_number: 16, image_page_number: 17 }],
    },
    validationIssues: [{
      sceneNumber: 8,
      code: "pause_requested_by_wrong_character",
      explanation: "Noa, rather than Eva, asks for the pause.",
    }],
    spreads: [{
      scene_number: 8,
      text_page_number: 16,
      image_page_number: 17,
    }],
    approvedScenario: {
      scenes: [{
        sceneNumber: 8,
        action: "Noa demande un moment avant de réessayer.",
        characterPresences: [
          { name: "Noa", mode: "physical", action: "demande un moment" },
          { name: "Eva", mode: "physical", action: "écoute Noa" },
        ],
        objectStates: [],
      }],
    },
  });

  assert.deepEqual(envelope.previous_plan.page_texts, [{
    page_number: 16,
    text: "Eva demande une pause.",
    speech_segments: [{
      speaker: "Eva",
      mode: "dialogue",
      text: "J'ai besoin d'une pause.",
    }],
  }]);
  assert.deepEqual(envelope.validation_issues, [{
    scene_number: 8,
    code: "pause_requested_by_wrong_character",
    repair_instruction: "Noa, rather than Eva, asks for the pause.",
  }]);
  assert.equal(envelope.repair_targets[0].approved_action, "Noa demande un moment avant de réessayer.");
  assert.deepEqual(
    envelope.repair_targets[0].approved_physical_characters.map((character) => character.name),
    ["Noa", "Eva"],
  );
});

test("scene normalization removes absent canonical characters from every visual field", () => {
  const contract = normalizeSceneContract({
    main_action: { subject: "Hada del Bosque", verb: "waves", target: "Noa" },
    named_characters: [
      { name: "Noa", action: "watches Eva hold the doll" },
      { name: "Eva", action: "holds Noa's doll" },
      { name: "Hada del Bosque", action: "waves from the porch" },
    ],
    generic_characters: [{
      id: "fairy_1",
      description: "a substitute for Hada del Bosque",
      action: "waves",
    }],
    required_elements: [{ description: "Hada del Bosque on the porch" }],
    spatial_relationships: ["Hada del Bosque stands behind Noa"],
    object_states: [{ name: "muñeco bebé", owner: "Eva", state: "held" }],
  }, {
    spread_number: 10,
    scene_number: 11,
    text_page_number: 22,
    image_page_number: 23,
    approved_scene: {
      characterPresences: [
        { name: "Noa", mode: "physical", action: "holds her muñeco bebé" },
        { name: "Eva", mode: "physical", action: "stands beside Noa" },
        { name: "Hada del Bosque", mode: "absent", action: "" },
      ],
      objectStates: [{
        name: "muñeco bebé",
        owner: "Noa",
        state: "held",
        quantity: 1,
      }],
    },
  }, [
    { name: "Noa" },
    { name: "Eva" },
    { name: "Hada del Bosque" },
  ]);

  assert.deepEqual(contract.named_characters.map((character) => character.name), ["Noa", "Eva"]);
  assert.equal(contract.named_characters[0].action, "holds her muñeco bebé");
  assert.equal(contract.named_characters[1].action, "stands beside Noa");
  assert.deepEqual(contract.generic_characters, []);
  assert.deepEqual(contract.required_elements, []);
  assert.deepEqual(contract.spatial_relationships, []);
  assert.equal(contract.main_action.subject, "Noa");
  assert.equal(contract.main_action.verb, "holds her muñeco bebé");
  assert.equal(contract.object_states[0].owner, "Noa");
});

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

test("scene contracts lock one visible instant to the approved before during after frame", () => {
  const contract = normalizeSceneContract({
    causal_frame: {
      visible_phase: "before",
      visible_location: "jardin de corail",
    },
  }, {
    spread_number: 2,
    scene_number: 2,
    text_page_number: 4,
    image_page_number: 5,
    approved_scene: {
      sceneNumber: 2,
      locationBefore: "maison de Bastien",
      locationAfter: "jardin de corail",
      action: "Bastien et Maman traversent le passage aquatique.",
      transition: {
        kind: "cross_passage",
        mechanism: "passage aquatique",
        mechanismId: "passage_aquatique",
        from: "maison de Bastien",
        to: "jardin de corail",
      },
      characterPresences: [],
      objectStates: [],
    },
    previous_approved_scene: { sceneNumber: 1 },
    next_approved_scene: { sceneNumber: 3 },
  }, canonicalCharacters);

  assert.equal(contract.causal_frame.before.location, "maison de Bastien");
  assert.equal(contract.causal_frame.during.transition_mechanism_id, "passage_aquatique");
  assert.equal(contract.causal_frame.after.location, "jardin de corail");
  assert.equal(contract.causal_frame.visible_phase, "before");
  assert.equal(contract.causal_frame.visible_location, "maison de Bastien");
});

test("a crossing scene may lock its single visible instant inside the approved passage", () => {
  const approvedScene = {
    sceneNumber: 2,
    locationBefore: "maison de Bastien",
    locationAfter: "jardin de corail",
    action: "Bastien et Maman traversent le passage aquatique.",
    transition: {
      kind: "cross_passage",
      mechanism: "passage aquatique",
      mechanismId: "passage_aquatique",
    },
    characterPresences: [],
    objectStates: [],
  };
  const contract = normalizeSceneContract({
    causal_frame: { visible_phase: "during", visible_location: "passage aquatique" },
  }, {
    spread_number: 2,
    scene_number: 2,
    text_page_number: 4,
    image_page_number: 5,
    approved_scene: approvedScene,
  }, canonicalCharacters);
  const issues = deterministicStoryPlanIssues({
    approvedScenario: { scenes: [approvedScene] },
    pageTexts: { 4: "Ils traversent le passage aquatique." },
    sceneContracts: [contract],
  });

  assert.equal(contract.causal_frame.visible_location, "passage aquatique");
  assert.equal(issues.some((issue) => issue.code === "causal_frame_mismatch"), false);
});

test("deterministic plan audit rejects an unexplained jump between adjacent scenes", () => {
  const scenario = {
    scenes: [
      {
        sceneNumber: 1,
        locationBefore: "maison de Bastien",
        locationAfter: "maison de Bastien",
        transition: { kind: "discover_passage", mechanismId: "passage_aquatique" },
        characterPresences: [],
        objectStates: [],
      },
      {
        sceneNumber: 2,
        locationBefore: "maison de Bastien",
        locationAfter: "jardin de corail",
        transition: { kind: "cross_passage", mechanismId: "passage_aquatique" },
        characterPresences: [],
        objectStates: [],
      },
    ],
  };
  const contracts = [
    {
      scene_number: 1,
      text_page_number: 2,
      named_characters: [],
      causal_frame: {
        before: { location: "maison de Bastien" },
        during: { transition_kind: "discover_passage", transition_mechanism_id: "passage_aquatique" },
        after: { location: "plage" },
        visible_phase: "after",
        visible_location: "plage",
      },
    },
    {
      scene_number: 2,
      text_page_number: 4,
      named_characters: [],
      causal_frame: {
        before: { location: "maison de Bastien" },
        during: { transition_kind: "cross_passage", transition_mechanism_id: "passage_aquatique" },
        after: { location: "jardin de corail" },
        visible_phase: "after",
        visible_location: "jardin de corail",
      },
    },
  ];

  const issues = deterministicStoryPlanIssues({
    approvedScenario: scenario,
    pageTexts: { 2: "Le passage apparaît.", 4: "Ils arrivent dans le jardin de corail." },
    sceneContracts: contracts,
  });

  assert.ok(issues.some((issue) => issue.code === "causal_frame_mismatch"));
  assert.ok(issues.some((issue) => issue.code === "adjacent_scene_discontinuity"));
});

test("a new audit contract never resumes an unversioned provider response", () => {
  const legacyProviderResponses = {
    "audit:targeted:primary": {
      responseId: "resp_legacy_targeted_audit",
      status: "completed",
    },
  };
  const versionedStep = versionedStoryPlanAuditStep("audit:targeted");
  const versionedProviderKey = `${versionedStep}:primary`;

  assert.equal(versionedStep, `audit-contract:v${STORY_PLAN_AUDIT_CONTRACT_VERSION}:audit:targeted`);
  assert.equal(legacyProviderResponses[versionedProviderKey], undefined);
  assert.equal(versionedStoryPlanAuditStep(versionedStep), versionedStep);
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
