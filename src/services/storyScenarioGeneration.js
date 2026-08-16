import { storyScenarioAgent } from "../agents/storyScenario.js";
import { storyScenarioAuditAgent } from "../agents/storyScenarioAudit.js";
import { createPagePlan } from "../config/bookStructure.js";
import { createStoryActContract } from "../config/storyActs.js";
import { createAgeIntentionContract } from "./ageIntentionContract.js";
import {
  applyCreatorStoryScenarioEdits,
  normalizeStoryScenario,
  scenarioCharacterRegistry,
  stabilizeStoryScenario,
  summarizeStoryScenarioValidation,
  validateStoryScenario,
  withStoryScenarioAuditEvidence,
} from "./storyScenario.js";
import {
  applyStoryScenarioRepairDirectives,
  buildStoryScenarioRepairDirectives,
  precompileStoryScenarioPassageLifecycles,
  validateStoryScenarioPassageLifecycles,
} from "./storyScenarioRepairs.js";
import {
  storyScenarioRepairProgress,
  storyScenarioRepairTransaction,
} from "./storyScenarioAutoRepair.js";
import { generationCostPolicy } from "./generationCostPolicy.js";
import { buildStoryCastParticipationContract } from "./storyCastParticipation.js";
import { canonicalizeStoryScenarioPhysicalChronology } from "./storyPhysicalChronology.js";

export function scenarioGenerationRoute(previousScenario = null, automaticRepair = false) {
  if (previousScenario && automaticRepair) {
    return { phase: "automatic-repair", modelRole: "story_repair" };
  }
  return previousScenario
    ? { phase: "revision", modelRole: "story_repair" }
    : { phase: "architect", modelRole: "story_architect" };
}

export function automaticRepairTargetSceneNumbers(plan = {}) {
  const sceneNumbers = new Set();
  const add = (value) => {
    const number = Number(value);
    if (Number.isInteger(number) && number > 0) sceneNumbers.add(number);
  };
  for (const number of plan?.publicSummary?.sceneNumbers || []) add(number);
  for (const diagnostic of plan?.validation?.diagnostics || []) add(diagnostic?.sceneNumber);
  for (const directive of plan?.directives || []) {
    for (const number of directive?.affectedSceneNumbers || []) add(number);
  }
  for (const issue of plan?.validation?.issues || []) {
    const match = String(issue || "").match(/scene[- ](\d+)/i);
    if (match) add(match[1]);
  }
  return [...sceneNumbers].sort((left, right) => left - right);
}

export function scopeAutomaticRepairCandidate(candidate = {}, previousScenario = {}, plan = {}) {
  const targetNumbers = new Set(automaticRepairTargetSceneNumbers(plan));
  if (!targetNumbers.size) return structuredClone(previousScenario);
  const candidateScenes = new Map((candidate?.scenes || []).map((scene) => [Number(scene?.sceneNumber), scene]));
  const previousScenes = previousScenario?.scenes || [];
  const scoped = structuredClone(candidate);
  scoped.scenes = previousScenes.map((previousScene) => {
    const number = Number(previousScene?.sceneNumber);
    return structuredClone(
      targetNumbers.has(number) && candidateScenes.has(number)
        ? candidateScenes.get(number)
        : previousScene,
    );
  });
  // These creator-approved/global choices are never repair targets. Object
  // and causal registries remain eligible because a targeted object-state
  // repair may need to update their canonical event metadata.
  for (const field of [
    "title",
    "summary",
    "clarifications",
    "creatorClarifications",
    "narrativeContract",
    "worldContract",
    "castParticipationContract",
    "characters",
    "wardrobePlan",
    "actPlanVersion",
    "ageIntentionContract",
  ]) {
    if (Object.hasOwn(previousScenario || {}, field)) scoped[field] = structuredClone(previousScenario[field]);
  }
  if (!Object.hasOwn(previousScenario || {}, "actPlanVersion")) delete scoped.actPlanVersion;
  if (!Object.hasOwn(previousScenario || {}, "ageIntentionContract")) delete scoped.ageIntentionContract;
  return scoped;
}

function consumeRepairBudget(repairBudget) {
  if (!repairBudget) return true;
  if (!Number.isFinite(repairBudget.remaining)) return true;
  if (repairBudget.remaining <= 0) return false;
  repairBudget.remaining -= 1;
  return true;
}

export async function runScenarioQualityDialogue({
  initialScenario,
  initialValidation,
  policy,
  repairStructural,
  auditEditorial,
  repairEditorial,
  beforeEditorial = null,
  repairBudget = null,
  editorialRepairBudget = null,
  canonicalRepairBudget = null,
}) {
  let scenario = initialScenario;
  let validation = initialValidation;
  let repairDirectives = [];
  let structuralRepairCalls = 0;
  let editorialRepairCalls = 0;
  let editorCalls = 0;
  let finalAuditCalls = 0;
  let structuralRepairTransaction = null;
  let editorialRepairTransaction = null;

  while (!validation.valid && structuralRepairCalls < policy.structuralRepairCalls) {
    if (!consumeRepairBudget(repairBudget)) break;
    const previousScenario = scenario;
    const previousValidation = validation;
    const previousRepairDirectives = repairDirectives;
    structuralRepairCalls += 1;
    const repaired = await repairStructural({
      scenario,
      validation,
      repairDirectives,
      attempt: structuralRepairCalls,
    });
    structuralRepairTransaction = storyScenarioRepairTransaction(
      previousValidation,
      repaired.validation,
      { phase: "structural" },
    );
    if (!structuralRepairTransaction.accepted) {
      scenario = previousScenario;
      validation = previousValidation;
      repairDirectives = previousRepairDirectives;
      break;
    }
    scenario = repaired.scenario;
    validation = repaired.validation;
    repairDirectives = repaired.repairDirectives || [];
  }

  if (!validation.valid) {
    return {
      scenario,
      validation,
      beforeEditorialResult: null,
      repairTransaction: structuralRepairTransaction,
      structuralRepairTransaction,
    };
  }

  let beforeEditorialResult = null;
  if (typeof beforeEditorial === "function") {
    beforeEditorialResult = await beforeEditorial({
      scenario,
      validation,
      repairBudget,
      canonicalRepairBudget,
    });
    scenario = beforeEditorialResult?.scenario || scenario;
    validation = beforeEditorialResult?.validation || validation;
    repairDirectives = beforeEditorialResult?.semanticRepairDirectives || repairDirectives;
  }

  const semanticAuditAlreadyRan = beforeEditorialResult?.semanticAuditRejected === true;
  if (!validation.valid && !semanticAuditAlreadyRan) {
    return {
      scenario,
      validation,
      beforeEditorialResult,
      repairTransaction: structuralRepairTransaction,
      structuralRepairTransaction,
    };
  }
  if (!semanticAuditAlreadyRan) {
    if (beforeEditorialResult?.skipEditorial || policy.editorCalls < 1) {
      return {
        scenario,
        validation,
        beforeEditorialResult,
        repairTransaction: structuralRepairTransaction,
        structuralRepairTransaction,
      };
    }
    editorCalls += 1;
    ({ scenario, validation, repairDirectives = [] } = await auditEditorial({
      scenario,
      validation,
      attempt: editorCalls,
      final: false,
    }));
  } else {
    // The canonical gate's final audit is the first semantic audit. Count it
    // so the mandatory post-repair audit receives the next stable attempt id.
    editorCalls += 1;
  }

  while (!validation.valid && editorialRepairCalls < policy.editorialRepairCalls) {
    if (!consumeRepairBudget(editorialRepairBudget || repairBudget)) break;
    const previousScenario = scenario;
    const previousValidation = validation;
    const previousRepairDirectives = repairDirectives;
    editorialRepairCalls += 1;
    const repaired = await repairEditorial({
      scenario,
      validation,
      repairDirectives,
      attempt: editorialRepairCalls,
    });
    scenario = repaired.scenario;
    validation = repaired.validation;
    repairDirectives = repaired.repairDirectives || [];

    if (!validation.valid) {
      editorialRepairTransaction = storyScenarioRepairTransaction(
        previousValidation,
        validation,
        { phase: "editorial_mechanical", allowInvalidProgress: false },
      );
      scenario = previousScenario;
      validation = previousValidation;
      repairDirectives = previousRepairDirectives;
      break;
    }
    if (finalAuditCalls >= policy.finalAuditCalls) {
      editorialRepairTransaction = {
        version: 1,
        phase: "editorial_semantic",
        accepted: false,
        reason: "final_audit_unavailable",
        previousIssueCount: summarizeStoryScenarioValidation(previousValidation).issueCount,
        issueCount: summarizeStoryScenarioValidation(validation).issueCount,
        resolvedSceneNumbers: [],
        introducedSceneNumbers: [],
        introducedCategories: [],
      };
      scenario = previousScenario;
      validation = previousValidation;
      repairDirectives = previousRepairDirectives;
      break;
    }

    finalAuditCalls += 1;
    editorCalls += 1;
    ({ scenario, validation, repairDirectives = [] } = await auditEditorial({
      scenario,
      validation,
      attempt: editorCalls,
      final: true,
    }));
    if (!validation.valid) {
      editorialRepairTransaction = storyScenarioRepairTransaction(
        previousValidation,
        validation,
        { phase: "editorial_semantic" },
      );
      if (!editorialRepairTransaction.accepted) {
        scenario = previousScenario;
        validation = previousValidation;
        repairDirectives = previousRepairDirectives;
      }
    } else {
      editorialRepairTransaction = {
        version: 1,
        phase: "editorial_semantic",
        accepted: true,
        reason: "approved",
        previousIssueCount: summarizeStoryScenarioValidation(previousValidation).issueCount,
        issueCount: 0,
        resolvedSceneNumbers: summarizeStoryScenarioValidation(previousValidation).sceneNumbers,
        introducedSceneNumbers: [],
        introducedCategories: [],
      };
    }
  }

  return {
    scenario,
    validation,
    repairDirectives,
    beforeEditorialResult,
    repairTransaction: editorialRepairTransaction || structuralRepairTransaction,
    structuralRepairTransaction,
    editorialRepairTransaction,
  };
}

export async function runCanonicalCandidateGate({
  scenario,
  validation,
  policy,
  check,
  repair,
  finalAudit,
  repairBudget = null,
}) {
  if (!validation.valid || typeof check !== "function") {
    return { scenario, validation, evidence: null };
  }
  let candidate = check(scenario);
  const initialIssues = privateCanonicalIssues(candidate);
  let repairAttempted = false;
  let finalAuditAttempted = false;
  let semanticRepairDirectives = [];
  const repairEnabled = policy.canonicalRepairCalls > 0;
  const repairBudgetAvailable = !repairBudget
    || !Number.isFinite(repairBudget.remaining)
    || repairBudget.remaining > 0;
  const repairBlockedByBudget = !candidate.valid && repairEnabled && !repairBudgetAvailable;
  if (!candidate.valid && policy.canonicalRepairCalls > 0 && consumeRepairBudget(repairBudget)) {
    repairAttempted = true;
    ({ scenario, validation } = await repair({
      scenario,
      validation: candidate.validation,
      repairDirectives: candidate.repairDirectives,
      attempt: 1,
    }));
    if (validation.valid && policy.canonicalFinalAuditCalls > 0) {
      finalAuditAttempted = true;
      const audited = await finalAudit({ scenario, validation });
      scenario = audited?.scenario || scenario;
      validation = audited?.validation || validation;
      semanticRepairDirectives = audited?.repairDirectives || [];
    }
    candidate = check(scenario);
  }
  if (candidate.valid && !validation.valid && finalAuditAttempted) {
    return {
      scenario,
      validation,
      evidence: null,
      repairAttempted,
      finalAuditAttempted,
      semanticAuditRejected: true,
      semanticRepairDirectives,
    };
  }
  if (!validation.valid || !candidate.valid) {
    const error = new Error(repairAttempted
      ? "The canonical scenario candidate could not be compiled after its bounded internal repair."
      : repairBlockedByBudget
        ? "The canonical scenario candidate could not be compiled because the shared repair budget was already exhausted."
        : "The canonical scenario candidate could not be compiled within the bounded repair policy.");
    error.code = "scenario_contract_invalid";
    error.canonicalDiagnostics = {
      version: 1,
      repairAttempted,
      finalAuditAttempted,
      ...(repairBlockedByBudget ? { repairBlockedByBudget: true } : {}),
      initialIssues,
      finalIssues: privateCanonicalIssues(candidate),
    };
    if (!candidate.valid) {
      error.privateCanonicalScenarioCandidate = structuredClone(scenario);
      error.canonicalScenarioValidation = candidate.validation || {
        valid: false,
        issues: [],
        diagnostics: [],
      };
      error.canonicalRepairDirectives = candidate.repairDirectives || [];
    }
    throw error;
  }
  return {
    scenario,
    validation,
    evidence: validation.valid ? candidate.evidence : null,
    repairAttempted,
    finalAuditAttempted,
  };
}

function privateCanonicalIssues(result = {}) {
  return (Array.isArray(result?.issues) ? result.issues : [])
    .slice(0, 12)
    .map((issue) => ({
      code: String(issue?.code || "canonical_compile_failed")
        .replace(/[^a-z0-9_-]+/gi, "_")
        .slice(0, 80),
      path: String(issue?.path || "").replace(/[^a-z0-9_.\[\]-]+/gi, "_").slice(0, 180),
      sceneNumber: Math.max(0, Number(issue?.sceneNumber || 0)),
    }));
}

export async function generateValidatedScenario({
  normalized,
  previousScenario,
  creatorClarifications,
  sceneEdits,
  addedCharacters,
  feedback,
  safetyContract,
  sensitivityContract,
  seriesContract = null,
  onStep = async () => {},
  backgroundExecution = null,
  modelRoles = {},
  canonicalCandidateCheck = null,
  automaticRepair = false,
  automaticRepairPlan = null,
  semanticAuditRecovery = false,
  semanticAuditRecoveryPlan = null,
  deterministicObjectRenderRecovery = false,
  canonicalCheckpointRecovery = false,
  canonicalCheckpointRecoveryPlan = null,
}) {
  const pagePlan = createPagePlan(normalized.answers.page_count);
  const ageIntentionContract = createAgeIntentionContract(normalized.answers, pagePlan);
  const creatorCast = scenarioCharacterRegistry(normalized);
  const castParticipationContract = buildStoryCastParticipationContract(
    creatorCast,
    pagePlan.filter((page) => page.page_type === "image").length,
  );
  const canonicalCharacters = [
    ...creatorCast,
    ...(previousScenario?.characters || []),
    ...addedCharacters.map((character) => ({
      name: character.name,
      role: "story_character",
      storyRole: "guest",
      relationship: "story character",
    })),
  ].filter((character, index, all) => (
    character.name
    && all.findIndex((candidate) => candidate.name.localeCompare(
      character.name,
      undefined,
      { sensitivity: "base" },
    ) === 0) === index
  ));
  const checkpointRecovery = semanticAuditRecovery || canonicalCheckpointRecovery;
  const recoveryPlan = canonicalCheckpointRecovery
    ? canonicalCheckpointRecoveryPlan
    : semanticAuditRecoveryPlan;
  const input = {
    intake: normalized.answers,
    canonical_characters: canonicalCharacters,
    cast_participation_contract: castParticipationContract,
    page_plan: pagePlan.filter((page) => page.page_type === "image"),
    act_contract: createStoryActContract(pagePlan),
    age_intention_contract: ageIntentionContract,
    creator_clarifications: creatorClarifications,
    creator_scene_edits: sceneEdits,
    creator_feedback: String(feedback || "").slice(0, 2000),
    child_safety_contract: safetyContract,
    sensitivity_contract: sensitivityContract,
    ...(seriesContract ? { series_continuity_contract: seriesContract } : {}),
    previous_scenario: previousScenario || null,
    ...(automaticRepair || checkpointRecovery ? {
      automatic_repair: true,
      validation_issues: (automaticRepairPlan || recoveryPlan)?.validation?.issues || [],
      repair_directives: (automaticRepairPlan || recoveryPlan)?.directives || [],
      repair_phase: canonicalCheckpointRecovery
        ? "canonical_checkpoint"
        : semanticAuditRecovery
          ? "semantic_checkpoint"
          : "automatic",
      repair_contract: {
        preserve_unrelated_creator_choices: true,
        maximum_model_repair_calls: 1,
        require_fresh_validation: true,
      },
    } : {}),
  };
  const configuredPolicy = generationCostPolicy().scenario;
  const policy = automaticRepair || checkpointRecovery ? {
    ...configuredPolicy,
    maximumRepairCalls: 0,
    maximumEditorialRepairCalls: 0,
    maximumCanonicalRepairCalls: 0,
    structuralRepairCalls: 0,
    editorialRepairCalls: 0,
    finalAuditCalls: 0,
    canonicalRepairCalls: 0,
    canonicalFinalAuditCalls: 0,
  } : configuredPolicy;
  const repairBudget = { remaining: Number(policy.maximumRepairCalls) };
  const editorialRepairBudget = {
    remaining: Number(policy.maximumEditorialRepairCalls),
  };
  const canonicalRepairBudget = {
    remaining: Number(policy.maximumCanonicalRepairCalls),
  };
  let scenario = null;
  let validation = { valid: false, issues: ["scenario has not been generated"] };
  const normalizeCandidate = (candidate, directives = []) => {
    let normalizedCandidate = normalizeStoryScenario(candidate, {
          pagePlan,
          canonicalCharacters,
          creatorClarifications,
          worldContract: normalized.answers.universe_story_contract,
          language: normalized.answers.language,
          requireCausalGraph: true,
          castParticipationContract,
          ageIntentionContract,
        });
    if ((automaticRepair || checkpointRecovery) && previousScenario) {
      normalizedCandidate = scopeAutomaticRepairCandidate(
        normalizedCandidate,
        previousScenario,
        automaticRepairPlan || recoveryPlan,
      );
    }
    let normalizedResult = precompileStoryScenarioPassageLifecycles(applyStoryScenarioRepairDirectives(stabilizeStoryScenario(
      applyCreatorStoryScenarioEdits(
        normalizedCandidate,
        { sceneEdits, addedCharacters },
      ),
    ), directives, { language: normalized.answers.language }), { language: normalized.answers.language });
    if ((automaticRepair || checkpointRecovery) && previousScenario) {
      normalizedResult = scopeAutomaticRepairCandidate(
        normalizedResult,
        previousScenario,
        automaticRepairPlan || recoveryPlan,
      );
      const physicalChronology = canonicalizeStoryScenarioPhysicalChronology(normalizedResult);
      if (physicalChronology.report.changed) {
        console.info("[story-physical-chronology] recovered", JSON.stringify(physicalChronology.report));
      }
      normalizedResult = physicalChronology.scenario;
    }
    return normalizedResult;
  };
  const validateCandidate = (candidate) => {
    const base = validateStoryScenario(candidate);
    const passage = validateStoryScenarioPassageLifecycles(candidate);
    return {
      ...base,
      valid: base.valid && passage.valid,
      issues: [...new Set([...(base.issues || []), ...(passage.issues || [])])],
      diagnostics: [...(base.diagnostics || []), ...(passage.diagnostics || [])],
    };
  };

  const generationRoute = scenarioGenerationRoute(previousScenario, automaticRepair || checkpointRecovery);
  const architectModelRole = generationRoute.phase !== "architect"
    ? (modelRoles.repair || generationRoute.modelRole)
    : (modelRoles.architect || generationRoute.modelRole);
  const repairModelRole = modelRoles.repair || "story_repair";
  const editorModelRole = modelRoles.editor || "story_editor";
  const jsonRepairModelRole = modelRoles.jsonRepair || repairModelRole;
  const semanticRecoveryTargets = automaticRepairTargetSceneNumbers(semanticAuditRecoveryPlan || {});
  const auditOnlyRecovery = deterministicObjectRenderRecovery || (semanticAuditRecovery
    && previousScenario
    && semanticRecoveryTargets.length === 0);
  await onStep({
    phase: canonicalCheckpointRecovery
      ? "canonical-checkpoint"
      : deterministicObjectRenderRecovery
        ? "object-render-checkpoint"
      : auditOnlyRecovery
        ? "semantic-checkpoint"
        : generationRoute.phase,
    attempt: 1,
  });
  if (auditOnlyRecovery) {
    scenario = normalizeCandidate(previousScenario);
  } else {
    const candidate = await storyScenarioAgent(
      {
        ...input,
        structural_repair_attempt: 1,
      },
      {
        backgroundExecution,
        backgroundStep: `${generationRoute.phase}:1`,
        modelRole: architectModelRole,
        jsonRepairModelRole,
      },
    );
    scenario = normalizeCandidate(candidate);
  }
  await onStep({ phase: "validation", attempt: 1 });
  validation = validateCandidate(scenario);

  const repairScenario = async ({
    scenario: currentScenario,
    validation: currentValidation,
    repairDirectives = [],
    attempt,
    kind,
  }) => {
    const directives = [
      ...repairDirectives,
      ...buildStoryScenarioRepairDirectives(currentScenario, currentValidation),
    ].slice(0, 12);
    await onStep({ phase: `${kind}-repair`, attempt });
    const repaired = await storyScenarioAgent(
      {
        ...input,
        previous_scenario: currentScenario,
        validation_issues: currentValidation.issues,
        repair_directives: directives,
        repair_phase: kind,
        structural_repair_attempt: attempt,
      },
      {
        backgroundExecution,
        backgroundStep: `repair:${kind}:${attempt}`,
        modelRole: repairModelRole,
        jsonRepairModelRole,
      },
    );
    const repairPlan = {
      validation: currentValidation,
      directives,
    };
    const scopedCandidate = kind === "editorial"
      ? scopeAutomaticRepairCandidate(repaired, currentScenario, repairPlan)
      : repaired;
    let repairedScenario = normalizeCandidate(scopedCandidate, directives);
    if (kind === "editorial") {
      repairedScenario = scopeAutomaticRepairCandidate(
        repairedScenario,
        currentScenario,
        repairPlan,
      );
    }
    await onStep({ phase: "validation", attempt });
    return {
      scenario: repairedScenario,
      validation: validateCandidate(repairedScenario),
      repairDirectives: directives,
    };
  };

  const auditScenario = async ({ scenario: currentScenario, attempt, final }) => {
    await onStep({ phase: "editor", attempt });
    const audit = await storyScenarioAuditAgent(
      {
        intake: normalized.answers,
        scenario: currentScenario,
      },
      {
        backgroundExecution,
        backgroundStep: `editor:${attempt}`,
        modelRole: editorModelRole,
        jsonRepairModelRole,
      },
    );
    const unactionableIssues = audit.issues.filter((issue) => (
      Number(issue.sceneNumber || 0) < 1
      && !(issue.affectedSceneNumbers || []).some((number) => Number(number) > 0)
    ));
    const auditedValidation = {
      valid: audit.status === "approved",
      issues: audit.issues.map((issue) => (
        `${issue.sceneNumber ? `scene-${issue.sceneNumber}: ` : ""}${issue.code}: ${issue.explanation}`
      )),
      diagnostics: audit.issues,
      repairDirectives: audit.repairDirectives,
    };
    if (unactionableIssues.length) {
      const error = new Error("The final semantic audit returned a blocking finding without an actionable scene coordinate.");
      error.code = "scenario_quality_gate_unresolved";
      error.privateScenarioCandidate = structuredClone(currentScenario);
      error.scenarioValidation = auditedValidation;
      error.semanticRepairDirectives = audit.repairDirectives;
      throw error;
    }
    const auditedScenario = structuredClone(currentScenario);
    if (auditedValidation.valid) {
      return {
        scenario: withStoryScenarioAuditEvidence(auditedScenario),
        validation: auditedValidation,
        repairDirectives: [],
      };
    }
    if (auditedScenario?.auditEvidence) delete auditedScenario.auditEvidence;
    return {
      scenario: auditedScenario,
      validation: auditedValidation,
      repairDirectives: audit.repairDirectives,
      final,
    };
  };

  let canonicalCandidateEvidence = null;
  const qualityResult = await runScenarioQualityDialogue({
    initialScenario: scenario,
    initialValidation: validation,
    policy,
    repairStructural: (state) => repairScenario({ ...state, kind: "structural" }),
    auditEditorial: auditScenario,
    repairEditorial: (state) => repairScenario({ ...state, kind: "editorial" }),
    beforeEditorial: typeof canonicalCandidateCheck === "function"
      ? async ({ scenario: currentScenario, validation: currentValidation, canonicalRepairBudget: availableCanonicalBudget }) => {
        const gated = await runCanonicalCandidateGate({
          scenario: currentScenario,
          validation: currentValidation,
          policy,
          check: canonicalCandidateCheck,
          repair: (state) => repairScenario({ ...state, kind: "canonical" }),
          finalAudit: (state) => auditScenario({ ...state, attempt: 2, final: true }),
          repairBudget: availableCanonicalBudget,
        });
        canonicalCandidateEvidence = gated.evidence;
        return {
          ...gated,
          skipEditorial: gated.finalAuditAttempted,
        };
      }
      : null,
    repairBudget,
    editorialRepairBudget,
    canonicalRepairBudget,
  });
  scenario = qualityResult.scenario;
  validation = qualityResult.validation;
  const boundedRecoveryPlan = automaticRepair ? automaticRepairPlan : recoveryPlan;
  let boundedRepairTransaction = null;
  let boundedRepairRolledBack = false;
  if ((automaticRepair || checkpointRecovery) && boundedRecoveryPlan?.validation && previousScenario) {
    boundedRepairTransaction = storyScenarioRepairTransaction(
      boundedRecoveryPlan.validation,
      validation,
      {
        phase: automaticRepair
          ? "automatic"
          : canonicalCheckpointRecovery
            ? "canonical_checkpoint"
            : "semantic_checkpoint",
      },
    );
    if (!boundedRepairTransaction.accepted) {
      scenario = structuredClone(previousScenario);
      validation = boundedRecoveryPlan.validation;
      canonicalCandidateEvidence = null;
      boundedRepairRolledBack = true;
    }
  }
  const finalRepairDirectives = boundedRepairRolledBack
    ? boundedRecoveryPlan.directives || validation.repairDirectives || []
    : qualityResult.repairDirectives || validation.repairDirectives || [];
  if (validation.valid && typeof canonicalCandidateCheck === "function") {
    // The editor is read-only when it approves a candidate, but an editorial
    // repair may have changed causal mechanics. Recompile once without another
    // model call so the one-repair ceiling remains absolute.
    const gated = await runCanonicalCandidateGate({
      scenario,
      validation,
      policy: {
        ...policy,
        canonicalRepairCalls: 0,
        canonicalFinalAuditCalls: 0,
      },
      check: canonicalCandidateCheck,
      repair: async () => {
        throw new Error("final canonical verification cannot repair");
      },
      finalAudit: async () => {
        throw new Error("final canonical verification cannot audit");
      },
    });
    scenario = gated.scenario;
    validation = gated.validation;
    canonicalCandidateEvidence = gated.evidence;
  }
  await onStep({ phase: "finalizing", attempt: 0 });
  const repairProgress = automaticRepair && automaticRepairPlan?.validation
    ? storyScenarioRepairProgress(automaticRepairPlan.validation, validation)
    : null;
  return {
    scenario,
    validation,
    canonicalCandidateEvidence,
    repairProgress,
    repairTransaction: boundedRepairTransaction || qualityResult.repairTransaction,
    checkpointRepairTransaction: checkpointRecovery ? boundedRepairTransaction : null,
    structuralRepairTransaction: qualityResult.structuralRepairTransaction,
    editorialRepairTransaction: qualityResult.editorialRepairTransaction,
    repairDirectives: finalRepairDirectives,
  };
}
