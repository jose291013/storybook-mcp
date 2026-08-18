ALTER TABLE narrative_artifacts
  DROP CONSTRAINT IF EXISTS narrative_artifacts_artifact_type_check;

ALTER TABLE narrative_artifacts
  ADD CONSTRAINT narrative_artifacts_artifact_type_check
  CHECK (artifact_type IN ('creation_intent','story_concept','canonical_story_graph'));

ALTER TABLE narrative_project_pointers
  DROP CONSTRAINT IF EXISTS narrative_project_pointers_artifact_type_check;

ALTER TABLE narrative_project_pointers
  ADD CONSTRAINT narrative_project_pointers_artifact_type_check
  CHECK (artifact_type IN ('creation_intent','story_concept','canonical_story_graph'));
