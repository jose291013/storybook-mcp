import {
  summarizeStoryScenarioValidation,
  validateStoryScenario,
} from "./storyScenario.js";
import {
  buildStoryScenarioRepairDirectives,
  validateStoryScenarioPassageLifecycles,
} from "./storyScenarioRepairs.js";

const REPAIRABLE_CATEGORIES = new Set([
  "passage",
  "object",
  "travel",
  "order",
  "incomplete",
  "progression",
  "emotion",
  "privacy",
  "symbol",
  "repetition",
  "age",
]);

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value || "").trim();
}

function storedDiagnosticIssues(scenario = {}) {
  return list(scenario?.validation?.diagnostics).map((diagnostic) => {
    const sceneNumber = Math.max(0, Number(diagnostic?.sceneNumber || 0));
    const code = text(diagnostic?.code) || "semantic_contradiction";
    const explanation = text(diagnostic?.explanation) || "The approved scenario contract is inconsistent.";
    return `${sceneNumber ? `scene-${sceneNumber}: ` : ""}${code}: ${explanation}`;
  });
}

function fallbackStoredIssues(scenario = {}) {
  if (scenario?.validation?.valid !== false) return [];
  if (storedDiagnosticIssues(scenario).length) return [];
  const categories = list(scenario?.validation?.categories).filter((category) => REPAIRABLE_CATEGORIES.has(category));
  const categoryScenes = scenario?.validation?.categoryScenes || {};
  return categories.flatMap((category) => {
    const scenes = list(categoryScenes[category]).map(Number).filter((number) => number > 0);
    if (!scenes.length) return [`${category}: repair the detected scenario contract inconsistency`];
    return scenes.map((sceneNumber) => `scene-${sceneNumber}: ${category}: repair the detected scenario contract inconsistency`);
  });
}

export function storyScenarioAutomaticRepairAssessment(scenario = {}) {
  if (!scenario || !list(scenario.scenes).length) {
    return { available: false, reason: "scenario_missing" };
  }
  if (list(scenario.clarifications).length) {
    return { available: false, reason: "creator_clarification_required" };
  }
  const deterministic = validateStoryScenario(scenario);
  const passages = validateStoryScenarioPassageLifecycles(scenario);
  const issues = [...new Set([
    ...list(deterministic.issues).map(text),
    ...list(passages.issues).map(text),
    ...storedDiagnosticIssues(scenario),
    ...fallbackStoredIssues(scenario),
  ].filter(Boolean))];
  const diagnostics = [
    ...list(deterministic.diagnostics),
    ...list(passages.diagnostics),
    ...list(scenario?.validation?.diagnostics),
  ];
  const validation = {
    valid: issues.length === 0,
    issues,
    diagnostics,
  };
  if (validation.valid) {
    return { available: false, reason: "scenario_already_valid" };
  }
  const summary = summarizeStoryScenarioValidation(validation);
  const categories = summary.categories.filter((category) => REPAIRABLE_CATEGORIES.has(category));
  if (!categories.length) {
    return { available: false, reason: "scenario_repair_not_supported" };
  }
  return {
    available: true,
    version: 1,
    validation,
    directives: buildStoryScenarioRepairDirectives(scenario, validation),
    publicSummary: {
      version: 1,
      issueCount: summary.issueCount,
      categories,
      sceneNumbers: summary.sceneNumbers,
      categoryScenes: Object.fromEntries(
        Object.entries(summary.categoryScenes).filter(([category]) => REPAIRABLE_CATEGORIES.has(category)),
      ),
    },
  };
}
