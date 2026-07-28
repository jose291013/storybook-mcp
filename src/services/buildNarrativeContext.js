export function buildNarrativeContext({ blueprint, intake, storybrand, approvedScenario = null, childSafetyContract = null }) {
  const normalizedIntake = intake?.intake || intake || {};
  const normalizedStorybrand = storybrand?.storybrand || storybrand || {};
  return {
    title: blueprint?.cover?.title || "",
    personal_details: {
      favorite_activities: normalizedIntake.favorite_activities || "",
      personality: normalizedIntake.personality || "",
      dream: normalizedIntake.dream || "",
      challenge: normalizedIntake.challenge || "",
      message: normalizedIntake.message || "",
      signature_object: normalizedIntake.signature_object || "",
      important_people: normalizedIntake.important_people || "",
      extra_notes: normalizedIntake.extra_notes || "",
      creator_situation: normalizedIntake.creator_situation || "",
      confirmed_intention: {
        id: normalizedIntake.story_intent_id || "",
        title: normalizedIntake.story_intent_title || "",
        understanding: normalizedIntake.story_intent_understanding || "",
        desired_change: normalizedIntake.story_intent_desired_change || "",
        protective_doubt: normalizedIntake.story_intent_protective_doubt || "",
        first_step: normalizedIntake.story_intent_first_step || "",
        motivation: normalizedIntake.story_intent_motivation || "",
        reward: normalizedIntake.story_intent_reward || "",
        message: normalizedIntake.story_intent_message || "",
      },
    },
    storybrand: normalizedStorybrand,
    world: blueprint?.world || {},
    cast: blueprint?.cast || [],
    plot_continuity: blueprint?.plot_continuity || {},
    approved_scenario: approvedScenario,
    child_safety_contract: childSafetyContract,
    outline: (blueprint?.pages || [])
      .filter((page) => ["text", "opening_text", "closing_text"].includes(page.page_type))
      .map((page) => {
        const pairedImage = (blueprint?.pages || []).find((candidate) => (
          candidate.page_type === "image" && candidate.scene_number === page.scene_number
        ));
        return {
          page_number: page.page_number,
          page_type: page.page_type,
          scene_number: page.scene_number,
          story_role: page.story_role,
          text_prompt: page.text_prompt,
          paired_image: pairedImage ? {
            page_number: pairedImage.page_number,
            cast_present: pairedImage.cast_present || [],
            visual_state: pairedImage.visual_state || {},
            image_prompt: pairedImage.image_prompt || "",
          } : null,
        };
      }),
  };
}
