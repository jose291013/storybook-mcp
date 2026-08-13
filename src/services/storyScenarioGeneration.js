import { storyScenarioAgent } from "../agents/storyScenario.js";
import { storyScenarioAuditAgent } from "../agents/storyScenarioAudit.js";
import { createPagePlan } from "../config/bookStructure.js";
import {
  applyCreatorStoryScenarioEdits,
  normalizeStoryScenario,
  scenarioCharacterRegistry,
  stabilizeStoryScenario,
  validateStoryScenario,
  withStoryScenarioAuditEvidence,
} from "./storyScenario.js";
import {
  applyStoryScenarioRepairDirectives,
  buildStoryScenarioRepairDirectives,
  precompileStoryScenarioPassageLifecycles,
  validateStoryScenarioPassageLifecycles,
} from "./storyScenarioRepairs.js";
import { generationCostPolicy } from "./generationCostPolicy.js";
import { buildStoryCastParticipationContract } from "./storyCastParticipation.js";

export function scenarioGenerationRoute(previousScenario = null, automaticRepair = false) {
  if (previousScenario && automaticRepair) {
    return { phase: "automatic-repair", modelRole: "story_repair" };
  }
  return previousScenario
    ? { phase: "revision", modelRole: "story_repair" }
    : { phase: "architect", modelRole: "story_architect" };
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
}) {
  let scenario = initialScenario;
  let validation = initialValidation;
  let repairDirectives = [];
  let structuralRepairCalls = 0;
  let editorialRepairCalls = 0;
  let editorCalls = 0;
  let finalAuditCalls = 0;

  while (!validation.valid && structuralRepairCalls < policy.structuralRepairCalls) {
    if (!consumeRepairBudget(repairBudget)) break;
    structuralRepairCalls += 1;
    ({ scenario, validation, repairDirectives = [] } = await repairStructural({
      scenario,
      validation,
      repairDirectives,
      attempt: structuralRepairCalls,
    }));
  }

  if (!validation.valid) {
    return { scenario, validation, beforeEditorialResult: null };
  }

  let beforeEditorialResult = null;
  if (typeof beforeEditorial === "function") {
    beforeEditorialResult = await beforeEditorial({
      scenario,
      validation,
      repairBudget,
    });
    scenario = beforeEditorialResult?.scenario || scenario;
    validation = beforeEditorialResult?.validation || validation;
    repairDirectives = beforeEditorialResult?.semanticRepairDirectives || repairDirectives;
  }

  const semanticAuditAlreadyRan = beforeEditorialResult?.semanticAuditRejected === true;
  if (!validation.valid && !semanticAuditAlreadyRan) {
    return { scenario, validation, beforeEditorialResult };
  }
  if (!semanticAuditAlreadyRan) {
    if (beforeEditorialResult?.skipEditorial || policy.editorCalls < 1) {
      return { scenario, validation, beforeEditorialResult };
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
    editorialRepairCalls += 1;
    ({ scenario, validation, repairDirectives = [] } = await repairEditorial({
      scenario,
      validation,
      repairDirectives,
      attempt: editorialRepairCalls,
    }));

    if (!validation.valid) continue;
    if (finalAuditCalls >= policy.finalAuditCalls) {
      validation = {
        valid: false,
        issues: ["scenario final semantic audit is required after editorial repair"],
        diagnostics: [],
      };
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
  }

  return { scenario, validation, beforeEditorialResult };
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
}) {
  const pagePlan = createPagePlan(normalized.answers.page_count);
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
  const input = {
    intake: normalized.answers,
    canonical_characters: canonicalCharacters,
    cast_participation_contract: castParticipationContract,
    page_plan: pagePlan.filter((page) => page.page_type === "image"),
    creator_clarifications: creatorClarifications,
    creator_scene_edits: sceneEdits,
    creator_feedback: String(feedback || "").slice(0, 2000),
    child_safety_contract: safetyContract,
    sensitivity_contract: sensitivityContract,
    ...(seriesContract ? { series_continuity_contract: seriesContract } : {}),
    previous_scenario: previousScenario || null,
    ...(automaticRepair ? {
      automatic_repair: true,
      validation_issues: automaticRepairPlan?.validation?.issues || [],
      repair_directives: automaticRepairPlan?.directives || [],
      repair_phase: "automatic",
      repair_contract: {
        preserve_unrelated_creator_choices: true,
        maximum_model_repair_calls: 1,
        require_fresh_validation: true,
      },
    } : {}),
  };
  const configuredPolicy = generationCostPolicy().scenario;
  const policy = automaticRepair ? {
    ...configuredPolicy,
    maximumRepairCalls: 0,
    maximumEditorialRepairCalls: 0,
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
  let scenario = null;
  let validation = { valid: false, issues: ["scenario has not been generated"] };
  const normalizeCandidate = (candidate, directives = []) => (
    precompileStoryScenarioPassageLifecycles(applyStoryScenarioRepairDirectives(stabilizeStoryScenario(
      applyCreatorStoryScenarioEdits(
        normalizeStoryScenario(candidate, {
          pagePlan,
          canonicalCharacters,
          creatorClarifications,
          worldContract: normalized.answers.universe_story_contract,
          language: normalized.answers.language,
          requireCausalGraph: true,
          castParticipationContract,
        }),
        { sceneEdits, addedCharacters },
      ),
    ), directives, { language: normalized.answers.language }), { language: normalized.answers.language })
  );
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

  const generationRoute = scenarioGenerationRoute(previousScenario, automaticRepair);
  const architectModelRole = generationRoute.phase !== "architect"
    ? (modelRoles.repair || generationRoute.modelRole)
    : (modelRoles.architect || generationRoute.modelRole);
  const repairModelRole = modelRoles.repair || "story_repair";
  const editorModelRole = modelRoles.editor || "story_editor";
  const jsonRepairModelRole = modelRoles.jsonRepair || repairModelRole;
  await onStep({ phase: generationRoute.phase, attempt: 1 });
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
    const repairedScenario = normalizeCandidate(repaired, directives);
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
    const auditedValidation = {
      valid: audit.status === "approved",
      issues: audit.issues.map((issue) => (
        `${issue.sceneNumber ? `scene-${issue.sceneNumber}: ` : ""}${issue.code}: ${issue.explanation}`
      )),
      diagnostics: audit.issues,
    };
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
      ? async ({ scenario: currentScenario, validation: currentValidation }) => {
        const gated = await runCanonicalCandidateGate({
          scenario: currentScenario,
          validation: currentValidation,
          policy,
          check: canonicalCandidateCheck,
          repair: (state) => repairScenario({ ...state, kind: "canonical" }),
          finalAudit: (state) => auditScenario({ ...state, attempt: 2, final: true }),
          repairBudget,
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
  });
  scenario = qualityResult.scenario;
  validation = qualityResult.validation;
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
  return { scenario, validation, canonicalCandidateEvidence };
}
