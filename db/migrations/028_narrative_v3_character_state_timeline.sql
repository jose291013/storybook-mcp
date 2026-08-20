ALTER TABLE narrative_artifacts
  DROP CONSTRAINT IF EXISTS narrative_artifacts_artifact_type_check;
ALTER TABLE narrative_artifacts
  ADD CONSTRAINT narrative_artifacts_artifact_type_check
  CHECK (artifact_type IN (
    'creation_intent', 'visual_intent', 'character_state_timeline',
    'story_concept', 'canonical_story_graph', 'object_lifecycle_projection',
    'narrative_book_spec', 'narrative_book_spec_v3', 'manuscript',
    'visual_storyboard', 'visual_continuity_plan', 'image_candidate_set',
    'illustration_decision_set', 'delivery_manifest'
  ));

ALTER TABLE narrative_project_pointers
  DROP CONSTRAINT IF EXISTS narrative_project_pointers_artifact_type_check;
ALTER TABLE narrative_project_pointers
  ADD CONSTRAINT narrative_project_pointers_artifact_type_check
  CHECK (artifact_type IN (
    'creation_intent', 'visual_intent', 'character_state_timeline',
    'story_concept', 'canonical_story_graph', 'object_lifecycle_projection',
    'narrative_book_spec', 'narrative_book_spec_v3', 'manuscript',
    'visual_storyboard', 'visual_continuity_plan', 'image_candidate_set',
    'illustration_decision_set', 'delivery_manifest'
  ));
