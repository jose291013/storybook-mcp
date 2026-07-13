export function buildNarrativeContext({ blueprint, intake, storybrand }) {
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
    },
    storybrand: normalizedStorybrand,
    world: blueprint?.world || {},
    cast: blueprint?.cast || [],
    plot_continuity: blueprint?.plot_continuity || {},
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
