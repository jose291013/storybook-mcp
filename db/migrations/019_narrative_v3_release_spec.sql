ALTER TABLE narrative_artifacts
  DROP CONSTRAINT IF EXISTS narrative_artifacts_artifact_type_check;

ALTER TABLE narrative_artifacts
  ADD CONSTRAINT narrative_artifacts_artifact_type_check
  CHECK (artifact_type IN ('creation_intent','story_concept','canonical_story_graph','narrative_book_spec'));

ALTER TABLE narrative_project_pointers
  DROP CONSTRAINT IF EXISTS narrative_project_pointers_artifact_type_check;

ALTER TABLE narrative_project_pointers
  ADD CONSTRAINT narrative_project_pointers_artifact_type_check
  CHECK (artifact_type IN ('creation_intent','story_concept','canonical_story_graph','narrative_book_spec'));

ALTER TABLE narrative_v3_steps
  DROP CONSTRAINT IF EXISTS narrative_v3_steps_step_type_check;

ALTER TABLE narrative_v3_steps
  ADD CONSTRAINT narrative_v3_steps_step_type_check
  CHECK (step_type IN ('parse_story_concept','compile_story_graph','release_narrative_book_spec'));

ALTER TABLE narrative_v3_steps
  DROP CONSTRAINT IF EXISTS narrative_v3_steps_output_artifact_type_check;

ALTER TABLE narrative_v3_steps
  ADD CONSTRAINT narrative_v3_steps_output_artifact_type_check
  CHECK (output_artifact_type IN ('story_concept','canonical_story_graph','narrative_book_spec'));
