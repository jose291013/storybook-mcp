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
  "cast",
  "incomplete",
  "progression",
  "emotion",
  "privacy",
  "symbol",
  "repetition",
  "age",
]);

function categoryFromFailureCode(code = "") {
  const value = text(code).toLowerCase();
  if (/cast|participant|role/.test(value)) return "cast";
  if (/passage|cross/.test(value)) return "passage";
  if (/object|state|quantity|owner|held|worn/.test(value)) return "object";
  if (/character|location|travel|movement|presence/.test(value)) return "travel";
  if (/order|prerequisite|sequence/.test(value)) return "order";
  return "incomplete";
}

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

export function storyScenarioAutomaticRepairFailureSummary(canonicalDiagnostics = null, scenarioValidation = null) {
  const finalIssues = list(canonicalDiagnostics?.finalIssues);
  const initialIssues = list(canonicalDiagnostics?.initialIssues);
  const issues = finalIssues.length ? finalIssues : initialIssues;
  const semanticSummary = scenarioValidation ? summarizeStoryScenarioValidation(scenarioValidation) : null;
  const categories = semanticSummary?.categories?.length
    ? semanticSummary.categories
    : [...new Set(issues.map((issue) => categoryFromFailureCode(issue?.code)))];
  const sceneNumbers = semanticSummary?.sceneNumbers?.length
    ? semanticSummary.sceneNumbers
    : [...new Set(issues
    .map((issue) => Math.max(0, Number(issue?.sceneNumber || 0)))
    .filter((sceneNumber) => sceneNumber > 0))].sort((left, right) => left - right);
  return {
    version: 1,
    reason: "final_checks_failed",
    categories: categories.length ? categories : ["incomplete"],
    sceneNumbers,
    ...(semanticSummary?.categoryScenes ? { categoryScenes: semanticSummary.categoryScenes } : {}),
    ...(semanticSummary?.diagnostics?.length ? { diagnostics: semanticSummary.diagnostics } : {}),
  };
}

export function storyScenarioRepairProgress(previousValidation = {}, candidateValidation = {}) {
  const previous = summarizeStoryScenarioValidation(previousValidation);
  const candidate = summarizeStoryScenarioValidation(candidateValidation);
  const previousCoordinates = new Set(previous.sceneNumbers.map(Number));
  const candidateCoordinates = new Set(candidate.sceneNumbers.map(Number));
  const resolvedSceneNumbers = [...previousCoordinates]
    .filter((number) => !candidateCoordinates.has(number))
    .sort((left, right) => left - right);
  const introducedSceneNumbers = [...candidateCoordinates]
    .filter((number) => !previousCoordinates.has(number))
    .sort((left, right) => left - right);
  const remainingPreviousSceneNumbers = [...previousCoordinates]
    .filter((number) => candidateCoordinates.has(number))
    .sort((left, right) => left - right);
  const improved = candidate.issueCount < previous.issueCount
    || (resolvedSceneNumbers.length > 0
      && remainingPreviousSceneNumbers.length < previousCoordinates.size);
  return {
    version: 1,
    improved,
    previousIssueCount: previous.issueCount,
    issueCount: candidate.issueCount,
    resolvedSceneNumbers,
    introducedSceneNumbers,
    remainingPreviousSceneNumbers,
    validation: candidateValidation,
    summary: candidate,
  };
}
