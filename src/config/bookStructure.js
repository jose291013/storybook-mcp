const STORY_ROLES = [
  "character_and_desire",
  "external_problem",
  "internal_problem",
  "meeting_the_guide",
  "simple_plan",
  "call_to_action",
  "first_attempt",
  "challenge_and_choice",
  "climax",
  "success_and_transformation",
  "return_home_and_moral",
];

export function createPagePlan() {
  const pages = [
    {
      page_number: 1,
      page_type: "opening_text",
      spread_number: 0,
      scene_number: 0,
      story_role: "introduction",
    },
  ];

  STORY_ROLES.forEach((storyRole, index) => {
    const leftPage = 2 + index * 2;
    const textOnLeft = index % 2 === 0;
    const sceneNumber = index + 1;
    pages.push(
      {
        page_number: leftPage,
        page_type: textOnLeft ? "text" : "image",
        spread_number: sceneNumber,
        scene_number: sceneNumber,
        story_role: storyRole,
      },
      {
        page_number: leftPage + 1,
        page_type: textOnLeft ? "image" : "text",
        spread_number: sceneNumber,
        scene_number: sceneNumber,
        story_role: storyRole,
      }
    );
  });

  pages.push({
    page_number: 24,
    page_type: "closing_text",
    spread_number: 12,
    scene_number: 12,
    story_role: "dedication_and_closing",
  });
  return pages;
}
export function applyPagePlan(blueprint) {
  const plan = createPagePlan();
  const generated = Array.isArray(blueprint?.pages) ? blueprint.pages : [];
  const byNumber = new Map(generated.map((page) => [Number(page?.page_number), page]));

  blueprint.pages = plan.map((planned) => {
    const page = byNumber.get(planned.page_number) || {};
    const isText = planned.page_type.includes("text") || planned.page_type === "text";
    const isImage = planned.page_type === "image";
    return {
      ...page,
      ...planned,
      text_prompt: isText ? String(page.text_prompt || "").trim() : "",
      image_prompt: isImage ? String(page.image_prompt || "").trim() : "",
    };
  });
  return blueprint;
}
