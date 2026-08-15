export const STORY_ACT_CONTRACT_VERSION = 1;

const ACT_BY_STORY_ROLE = Object.freeze({
  introduction: 1,
  character_and_desire: 1,
  world_discovery: 1,
  external_problem: 1,
  internal_problem: 1,
  meeting_the_guide: 1,
  bond_with_the_guide: 1,
  simple_plan: 2,
  preparing_the_plan: 2,
  call_to_action: 2,
  crossing_the_threshold: 2,
  first_attempt: 2,
  second_attempt: 2,
  clue_and_discovery: 2,
  setback_and_learning: 2,
  third_attempt: 2,
  challenge_and_choice: 2,
  climax: 3,
  quiet_reflection: 3,
  success_and_transformation: 3,
  celebration_with_loved_ones: 3,
  return_home_and_moral: 3,
  dedication_and_closing: 3,
});

const ACT_PURPOSES = Object.freeze({
  1: Object.freeze({
    id: "setup_and_commitment",
    purpose: "Establish the child, desire, external and internal problem, then the guide relationship before the plan begins.",
  }),
  2: Object.freeze({
    id: "attempts_and_choice",
    purpose: "Let the child prepare and attempt the plan, learn from consequences and make the choice that enables the climax.",
  }),
  3: Object.freeze({
    id: "climax_and_resolution",
    purpose: "Let the child perform the decisive action, experience its earned transformation and complete the return or resolution.",
  }),
});

function normalizedAct(value) {
  const act = Number(value);
  return Number.isInteger(act) && act >= 1 && act <= 3 ? act : 0;
}

export function storyActForRole(storyRole, {
  index = 0,
  total = 1,
  fallbackAct = 0,
} = {}) {
  const fixed = ACT_BY_STORY_ROLE[String(storyRole || "").trim()];
  if (fixed) return fixed;
  const fallback = normalizedAct(fallbackAct);
  if (fallback) return fallback;
  const count = Math.max(1, Number(total) || 1);
  const position = (Math.max(0, Number(index) || 0) + 1) / count;
  if (position <= 0.3) return 1;
  if (position <= 0.75) return 2;
  return 3;
}

export function createStoryActContract(pagePlan = []) {
  const scenes = (Array.isArray(pagePlan) ? pagePlan : [])
    .filter((page) => page?.page_type === "image")
    .map((page, index, all) => ({
      sceneNumber: Number(page.scene_number),
      storyRole: String(page.story_role || ""),
      act: storyActForRole(page.story_role, {
        index,
        total: all.length,
        fallbackAct: page.act,
      }),
    }));
  return {
    version: STORY_ACT_CONTRACT_VERSION,
    boundaryPolicy: "server_owned_story_role_mapping",
    acts: [1, 2, 3].map((act) => {
      const actScenes = scenes.filter((scene) => scene.act === act);
      return {
        act,
        ...ACT_PURPOSES[act],
        sceneNumbers: actScenes.map((scene) => scene.sceneNumber),
        storyRoles: actScenes.map((scene) => scene.storyRole),
        startsAtScene: actScenes[0]?.sceneNumber || 0,
        endsAtScene: actScenes.at(-1)?.sceneNumber || 0,
      };
    }),
  };
}

export function storyActContractIssues(contract = {}) {
  const issues = [];
  if (Number(contract?.version) !== STORY_ACT_CONTRACT_VERSION) {
    issues.push("story act contract version is invalid");
  }
  const acts = Array.isArray(contract?.acts) ? contract.acts : [];
  if (acts.length !== 3) issues.push("story act contract requires exactly three acts");
  let previousEnd = 0;
  for (const expectedAct of [1, 2, 3]) {
    const act = acts.find((item) => Number(item?.act) === expectedAct);
    if (!act) {
      issues.push(`story act ${expectedAct} is missing`);
      continue;
    }
    const sceneNumbers = (Array.isArray(act.sceneNumbers) ? act.sceneNumbers : []).map(Number);
    if (!sceneNumbers.length) issues.push(`story act ${expectedAct} has no scenes`);
    if (sceneNumbers.some((number, index) => index > 0 && number !== sceneNumbers[index - 1] + 1)) {
      issues.push(`story act ${expectedAct} scenes must be contiguous`);
    }
    if (sceneNumbers.length && sceneNumbers[0] !== previousEnd + 1) {
      issues.push(`story act ${expectedAct} must start after the preceding act`);
    }
    if (sceneNumbers.length) previousEnd = sceneNumbers.at(-1);
  }
  return issues;
}
