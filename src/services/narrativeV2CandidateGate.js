import {
  NarrativeBookSpecCompileError,
  compileNarrativeBookSpec,
} from "../contracts/compileNarrativeBookSpec.js";
import {
  canonicalNarrativeV2Safety,
  narrativeV2BookConfiguration,
} from "./narrativeV2Shadow.js";
import { withStoryScenarioAuditEvidence } from "./storyScenario.js";

export const NARRATIVE_V2_CANDIDATE_GATE_VERSION = 1;

function clean(value, maximum = 600) {
  return String(value || "").trim().slice(0, maximum);
}

function sceneNumberFromPath(path = "") {
  const match = String(path).match(/scenes\[(\d+)\]/);
  return match ? Number(match[1]) + 1 : 0;
}

function mechanicalCandidateScenario(scenario = {}, now = new Date().toISOString()) {
  const approvedShape = {
    ...scenario,
    status: "approved",
    revision: Math.max(1, Number(scenario.revision || 1)),
    approvedAt: scenario.approvedAt || now,
  };
  // This candidate is never persisted. The strict compiler requires an audit
  // digest, so the mechanical preflight supplies an ephemeral digest for the
  // exact in-memory shape being compiled. The real editor audit remains
  // mandatory before the scenario or its final contract can be stored.
  return withStoryScenarioAuditEvidence(approvedShape, { auditedAt: now });
}

function boundedCompileIssues(error) {
  const entries = error instanceof NarrativeBookSpecCompileError
    ? error.issues
    : [{ code: error?.code || "canonical_compile_failed", path: "", message: error?.message }];
  return entries.slice(0, 12).map((issue) => ({
    code: clean(issue?.code, 80) || "canonical_compile_failed",
    path: clean(issue?.path, 180),
    sceneNumber: sceneNumberFromPath(issue?.path),
    explanation: clean(issue?.message || issue?.code),
  }));
}

export function compileNarrativeV2Candidate(
  { project, scenario } = {},
  { compile = compileNarrativeBookSpec, now = () => new Date().toISOString() } = {},
) {
  try {
    const spec = compile({
      projectId: project?.id,
      scenario: mechanicalCandidateScenario(scenario, now()),
      book: narrativeV2BookConfiguration(project),
      safety: canonicalNarrativeV2Safety(project),
    });
    return {
      version: NARRATIVE_V2_CANDIDATE_GATE_VERSION,
      valid: true,
      issues: [],
      evidence: {
        version: NARRATIVE_V2_CANDIDATE_GATE_VERSION,
        status: "compiled",
        sourceScenarioDigest: clean(spec?.sourceScenario?.digest, 64),
        artifactDigest: clean(spec?.validation?.artifactDigest, 64),
        compilerVersion: Number(spec?.validation?.compilerVersion || 0),
        mechanicalValidatorVersion: Number(spec?.validation?.mechanicalValidatorVersion || 0),
        compiledAt: now(),
      },
    };
  } catch (error) {
    return {
      version: NARRATIVE_V2_CANDIDATE_GATE_VERSION,
      valid: false,
      issues: boundedCompileIssues(error),
      evidence: null,
    };
  }
}

export function canonicalGateValidation(result = {}) {
  if (result.valid) return { valid: true, issues: [], diagnostics: [] };
  const diagnostics = (result.issues || []).map((issue) => ({
    code: issue.code,
    sceneNumber: issue.sceneNumber,
    path: issue.path,
    explanation: issue.explanation,
  }));
  return {
    valid: false,
    issues: diagnostics.map((issue) => (
      `${issue.sceneNumber ? `scene-${issue.sceneNumber}: ` : ""}${issue.code}: ${issue.explanation}`
    )),
    diagnostics,
  };
}

export function canonicalGateRepairDirectives(result = {}) {
  return (result.issues || []).map((issue) => ({
    type: "canonical_compile_repair",
    code: issue.code,
    affectedSceneNumbers: issue.sceneNumber ? [issue.sceneNumber] : [],
    entityIds: [],
    instruction: `Repair the canonical contract violation at ${issue.path || "the scenario"}: ${issue.explanation}`,
  }));
}
