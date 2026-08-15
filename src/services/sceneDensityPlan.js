export const SCENE_DENSITY_PLAN_VERSION = 1;

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function key(value) {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function unique(values = []) {
  const seen = new Set();
  return values.map(clean).filter((value) => {
    const normalized = key(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function densityProfile(audienceAge) {
  const age = Math.max(1, Math.min(14, Number(audienceAge || 7)));
  if (age <= 3) return { age_band: "1-3", high_salience_limit: 2, decorative_detail_limit: 1, density_mode: "very_clear" };
  if (age <= 5) return { age_band: "4-5", high_salience_limit: 2, decorative_detail_limit: 2, density_mode: "clear" };
  if (age <= 8) return { age_band: "6-8", high_salience_limit: 2, decorative_detail_limit: 3, density_mode: "clear_layered" };
  if (age <= 11) return { age_band: "9-11", high_salience_limit: 3, decorative_detail_limit: 4, density_mode: "layered" };
  return { age_band: "12-14", high_salience_limit: 3, decorative_detail_limit: 5, density_mode: "rich_but_ordered" };
}

export function compileSceneDensityPlan({
  audienceAge = 7,
  mainAction = {},
  namedCharacters = [],
  requiredElements = [],
  objectStates = [],
} = {}) {
  const profile = densityProfile(audienceAge);
  const subject = clean(mainAction?.subject);
  const target = clean(mainAction?.target);
  const primaryFocus = unique([subject, target]).slice(0, profile.high_salience_limit);
  const supportingCast = unique(namedCharacters.map((character) => character?.name))
    .filter((name) => !primaryFocus.some((primary) => key(primary) === key(name)));
  const supportingElements = unique(requiredElements.map((element) => element?.description))
    .filter((element) => !primaryFocus.some((primary) => key(primary) === key(element)));
  const backgroundStates = unique(objectStates
    .filter((state) => state?.state !== "absent" && Number(state?.quantity ?? 1) > 0)
    .map((state) => `${clean(state?.name)}: ${clean(state?.state)}`))
    .filter((state) => !primaryFocus.some((primary) => key(state).startsWith(key(primary))));
  return {
    version: SCENE_DENSITY_PLAN_VERSION,
    audience_age: Math.max(1, Math.min(14, Number(audienceAge || 7))),
    ...profile,
    primary_focus: primaryFocus,
    supporting_cast: supportingCast,
    supporting_elements: supportingElements,
    background_states: backgroundStates,
    canonical_element_count: unique([
      ...namedCharacters.map((character) => character?.name),
      ...requiredElements.map((element) => element?.description),
      ...objectStates.filter((state) => state?.state !== "absent").map((state) => state?.name),
    ]).length,
    hierarchy_rule: "Only the primary focus may carry maximum contrast and detail. Required supporting cast and elements remain complete and readable but visually subordinate; background states remain low-salience context.",
    decoration_rule: `Add at most ${profile.decorative_detail_limit} non-canonical decorative accents. Never add decorative people, duplicate landmarks or a second focal action.`,
  };
}

export function sceneDensityPlanIssues(sceneContracts = []) {
  const issues = [];
  for (const contract of Array.isArray(sceneContracts) ? sceneContracts : []) {
    const sceneNumber = Number(contract?.scene_number || 0);
    const density = contract?.scene_density;
    if (Number(density?.version) !== SCENE_DENSITY_PLAN_VERSION) {
      issues.push(`scene ${sceneNumber} density plan version is invalid`);
      continue;
    }
    if (!Number.isInteger(density.high_salience_limit) || density.high_salience_limit < 2 || density.high_salience_limit > 3) {
      issues.push(`scene ${sceneNumber} density high-salience limit is invalid`);
    }
    if (!Array.isArray(density.primary_focus) || !density.primary_focus.length
      || density.primary_focus.length > density.high_salience_limit) {
      issues.push(`scene ${sceneNumber} density primary focus is invalid`);
    }
    if (!String(density.hierarchy_rule || "").trim() || !String(density.decoration_rule || "").trim()) {
      issues.push(`scene ${sceneNumber} density hierarchy rules are missing`);
    }
    const allLayers = [
      ...(density.primary_focus || []),
      ...(density.supporting_cast || []),
      ...(density.supporting_elements || []),
      ...(density.background_states || []),
    ].map(key).filter(Boolean);
    if (new Set(allLayers).size !== allLayers.length) {
      issues.push(`scene ${sceneNumber} density layers duplicate one visual entity`);
    }
  }
  return [...new Set(issues)];
}
