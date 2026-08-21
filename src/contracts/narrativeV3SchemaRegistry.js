import fs from "node:fs";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
  allowUnionTypes: true,
});
addFormats(ajv);

function readSchema(name) {
  return JSON.parse(fs.readFileSync(new URL(`./${name}`, import.meta.url), "utf8"));
}

export const storyConceptWireSchema = readSchema("storyConceptWire.v1.schema.json");
export const storyConceptSchema = readSchema("storyConcept.v1.schema.json");
export const canonicalStoryGraphSchema = readSchema("canonicalStoryGraph.v1.schema.json");
export const canonicalStoryMechanicsSchema = readSchema("canonicalStoryMechanics.v1.schema.json");
export const creationIntentSchema = readSchema("creationIntent.v1.schema.json");
export const visualIntentSchema = readSchema("visualIntent.v1.schema.json");
export const worldLawContractSchema = readSchema("worldLawContract.v1.schema.json");
export const narrativeBriefSchema = readSchema("narrativeBrief.v1.schema.json");
export const characterStateTimelineSchema = readSchema("characterStateTimeline.v1.schema.json");
export const narrativeBookSpecV2Schema = readSchema("narrativeBookSpec.v2.schema.json");
export const objectLifecycleProjectionSchema = readSchema("objectLifecycleProjection.v1.schema.json");
export const narrativeBookSpecV3Schema = readSchema("narrativeBookSpec.v3.schema.json");
export const manuscriptWireSchema = readSchema("manuscriptWire.v1.schema.json");
export const manuscriptSchema = readSchema("manuscript.v1.schema.json");
export const manuscriptFactEvidenceSchema = readSchema("manuscriptFactEvidence.v1.schema.json");
export const visualStoryboardSchema = readSchema("visualStoryboard.v1.schema.json");
export const visualContinuityPlanSchema = readSchema("visualContinuityPlan.v1.schema.json");
export const imageCandidateSetSchema = readSchema("imageCandidateSet.v1.schema.json");
export const illustrationEvaluationWireSchema = readSchema("illustrationEvaluationWire.v1.schema.json");
export const illustrationDecisionSetSchema = readSchema("illustrationDecisionSet.v1.schema.json");
export const illustrationEvaluationWireV2Schema = readSchema("illustrationEvaluationWire.v2.schema.json");
export const illustrationDecisionSetV2Schema = readSchema("illustrationDecisionSet.v2.schema.json");
export const deliveryManifestSchema = readSchema("deliveryManifest.v1.schema.json");
export const deliveryManifestV2Schema = readSchema("deliveryManifest.v2.schema.json");

ajv.addSchema(creationIntentSchema);
ajv.addSchema(visualIntentSchema);
ajv.addSchema(worldLawContractSchema);
ajv.addSchema(narrativeBriefSchema);
ajv.addSchema(characterStateTimelineSchema);
ajv.addSchema(storyConceptWireSchema);
ajv.addSchema(storyConceptSchema);
ajv.addSchema(canonicalStoryGraphSchema);
ajv.addSchema(canonicalStoryMechanicsSchema);
ajv.addSchema(narrativeBookSpecV2Schema);
ajv.addSchema(objectLifecycleProjectionSchema);
ajv.addSchema(narrativeBookSpecV3Schema);
ajv.addSchema(manuscriptWireSchema);
ajv.addSchema(manuscriptSchema);
ajv.addSchema(manuscriptFactEvidenceSchema);
ajv.addSchema(visualStoryboardSchema);
ajv.addSchema(visualContinuityPlanSchema);
ajv.addSchema(imageCandidateSetSchema);
ajv.addSchema(illustrationEvaluationWireSchema);
ajv.addSchema(illustrationDecisionSetSchema);
ajv.addSchema(illustrationEvaluationWireV2Schema);
ajv.addSchema(illustrationDecisionSetV2Schema);
ajv.addSchema(deliveryManifestSchema);
ajv.addSchema(deliveryManifestV2Schema);

const validators = new Map([
  ["creation_intent", ajv.getSchema(creationIntentSchema.$id)],
  ["visual_intent", ajv.getSchema(visualIntentSchema.$id)],
  ["world_law_contract", ajv.getSchema(worldLawContractSchema.$id)],
  ["narrative_brief", ajv.getSchema(narrativeBriefSchema.$id)],
  ["character_state_timeline", ajv.getSchema(characterStateTimelineSchema.$id)],
  ["story_concept_wire", ajv.getSchema(storyConceptWireSchema.$id)],
  ["story_concept", ajv.getSchema(storyConceptSchema.$id)],
  ["canonical_story_graph", ajv.getSchema(canonicalStoryGraphSchema.$id)],
  ["canonical_story_mechanics", ajv.getSchema(canonicalStoryMechanicsSchema.$id)],
  ["narrative_book_spec_v2", ajv.getSchema(narrativeBookSpecV2Schema.$id)],
  ["object_lifecycle_projection", ajv.getSchema(objectLifecycleProjectionSchema.$id)],
  ["narrative_book_spec_v3", ajv.getSchema(narrativeBookSpecV3Schema.$id)],
  ["manuscript_wire_v1", ajv.getSchema(manuscriptWireSchema.$id)],
  ["manuscript_v1", ajv.getSchema(manuscriptSchema.$id)],
  ["manuscript_fact_evidence_v1", ajv.getSchema(manuscriptFactEvidenceSchema.$id)],
  ["visual_storyboard_v1", ajv.getSchema(visualStoryboardSchema.$id)],
  ["visual_continuity_plan_v1", ajv.getSchema(visualContinuityPlanSchema.$id)],
  ["image_candidate_set_v1", ajv.getSchema(imageCandidateSetSchema.$id)],
  ["illustration_evaluation_wire_v1", ajv.getSchema(illustrationEvaluationWireSchema.$id)],
  ["illustration_decision_set_v1", ajv.getSchema(illustrationDecisionSetSchema.$id)],
  ["illustration_evaluation_wire_v2", ajv.getSchema(illustrationEvaluationWireV2Schema.$id)],
  ["illustration_decision_set_v2", ajv.getSchema(illustrationDecisionSetV2Schema.$id)],
  ["delivery_manifest_v1", ajv.getSchema(deliveryManifestSchema.$id)],
  ["delivery_manifest_v2", ajv.getSchema(deliveryManifestV2Schema.$id)],
]);

function boundedErrors(errors = []) {
  return errors.slice(0, 20).map((error) => ({
    keyword: String(error?.keyword || "invalid"),
    path: String(error?.instancePath || "/"),
    schemaPath: String(error?.schemaPath || ""),
    message: String(error?.message || "does not match the contract"),
  }));
}

export class NarrativeV3ContractError extends Error {
  constructor({ code = "narrative_v3_contract_invalid", artifactType = "unknown", issues = [] } = {}) {
    super(`${artifactType} does not match its strict Narrative V3 contract.`);
    this.name = "NarrativeV3ContractError";
    this.code = code;
    this.artifactType = artifactType;
    this.issues = issues;
  }
}

export function assertNarrativeV3Schema(artifactType, value) {
  const validator = validators.get(artifactType);
  if (!validator) {
    throw new NarrativeV3ContractError({
      code: "narrative_v3_schema_unknown",
      artifactType,
      issues: [{ path: "/", message: "No strict schema is registered for this artifact type." }],
    });
  }
  if (!validator(value)) {
    throw new NarrativeV3ContractError({
      artifactType,
      issues: boundedErrors(validator.errors),
    });
  }
  return true;
}
