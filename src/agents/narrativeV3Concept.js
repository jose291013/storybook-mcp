import { chatJson } from "../services/openai.js";

const PURPOSES = "opening, desire, preparation, crossing, attempt, setback, choice, climax, return, resolution";

function compactSource(source = {}) {
  return {
    language: source.language,
    audience_age: source.audienceAge,
    scene_count: source.sceneCount,
    universe: source.universe,
    hero: source.hero,
    creator_goal: source.creatorGoal,
    story_seed: source.storySeed,
    cast: source.cast,
    required_structure: source.requiredStructure,
    ...(source.seriesContinuity ? { series_continuity: source.seriesContinuity } : {}),
    ...(source.revisionRequest ? { revision_request: source.revisionRequest } : {}),
    ...(source.validationFeedback ? { validation_feedback: source.validationFeedback } : {}),
  };
}

export async function narrativeV3ConceptAgent(source, { backgroundExecution = null } = {}) {
  const system = `You are Calitiki Narrative V3's semantic concept architect.
Create one original, emotionally satisfying children's story concept in the requested language. The adult's goal must be demonstrated through the child's choices, never merely preached.

You author SEMANTICS ONLY. Do not invent machine ids for locations, passages, movements, wardrobe, equipment, objects, acts, pages or illustration cast. The deterministic compiler owns those facts.

Return exactly one JSON object matching calitiki.story-concept-wire.v1:
- schema_version: 1
- contract_id: "calitiki.story-concept-wire.v1"
- language: FR, ES or EN exactly as requested
- title, premise, theme_proof
- hero_arc with desire, initial_doubt, decisive_choice, earned_change
- beats: exactly the requested scene_count; each beat has beat_key, purpose, summary, emotional_shift, distinctive_image, participant_keys

Hard structural rules:
1. The first purpose is opening and the last purpose is resolution.
2. Use exactly one preparation before the crossing, exactly one crossing in act 2, exactly one climax in act 3, and exactly one return in act 3 after the climax and before resolution.
   Follow required_structure: crossing must be inside crossingSceneRange, climax must use climaxScene, return must use returnScene, and resolution must use resolutionScene (scene numbers are one-based).
   The preparation beat explicitly shows the future travelers changing into their adventure clothing and preparing any universe-required individual equipment while they are still on the origin side. The crossing beat then shows those same travelers entering; witnesses who stay behind never receive traveler clothing or equipment.
3. Beat purposes must come only from: ${PURPOSES}.
4. Every beat contains the hero key. Participant keys come only from the supplied cast.
5. Every supplied cast key participates meaningfully in at least one beat.
6. A character used in any beat strictly between crossing and return is either a local adventure-side character, or participates in crossing. If that same character appears after return, it also participates in return. Origin-only supporters may appear before crossing and after return while remaining absent from the adventure window. Never teleport a participant.
7. The crossing and return describe the same bounded passage in opposite directions, without naming endpoints as if they were multiple passages. The return ends back on the origin side; removal or storage of conditional equipment is explicit before the resolution.
8. Each beat must advance action or emotion. Avoid repeated trials, duplicate landmarks and unexplained state changes.
9. distinctive_image describes only the meaningful instant, not technical rendering instructions.
10. Keep all strings within the supplied contract bounds and return no additional fields.`;
  const seriesRule = source.seriesContinuity
    ? "\n11. This is a series episode. Preserve the supplied stable character relationships and universe continuity, while creating a new conflict, action sequence and earned resolution."
    : "";

  const validationRule = source.validationFeedback
    ? "\n12. The preceding semantic candidate was rejected before persistence. Correct every supplied validation_feedback item; do not copy an invalid field merely to preserve the earlier draft."
    : "";

  return chatJson({
    system: `${system}${seriesRule}${validationRule}`,
    user: JSON.stringify(compactSource(source)),
    temperature: 0.2,
    clientKind: "background",
    modelRole: "narrative_v3_concept",
    backgroundExecution,
  }).then((result) => {
    if (!result?.__json_ok) throw new Error("narrative_v3_concept_invalid_json");
    return result.data;
  });
}
