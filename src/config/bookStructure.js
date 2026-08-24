import { normalizePageCount } from "./bookOptions.js";
import { storyActForRole } from "./storyActs.js";
import { findBookFormat } from "./bookFormats.js";

const CORE_STORY_ROLES = [
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

const EXPANSION_SCENES = [
  { role: "world_discovery", after: "character_and_desire" },
  { role: "second_attempt", after: "first_attempt" },
  { role: "bond_with_the_guide", after: "meeting_the_guide" },
  { role: "clue_and_discovery", after: "second_attempt" },
  { role: "preparing_the_plan", after: "simple_plan" },
  { role: "setback_and_learning", after: "clue_and_discovery" },
  { role: "crossing_the_threshold", after: "call_to_action" },
  { role: "quiet_reflection", after: "climax" },
  { role: "third_attempt", after: "setback_and_learning" },
  { role: "celebration_with_loved_ones", after: "success_and_transformation" },
];

export function createStoryRoles(interiorPageCount = 24) {
  const pageCount = normalizePageCount(interiorPageCount);
  const spreadCount = (pageCount - 2) / 2;
  const roles = [...CORE_STORY_ROLES];
  const extraCount = spreadCount - CORE_STORY_ROLES.length;

  for (const extension of EXPANSION_SCENES.slice(0, extraCount)) {
    const anchor = roles.indexOf(extension.after);
    roles.splice(anchor >= 0 ? anchor + 1 : roles.length - 2, 0, extension.role);
  }
  return roles;
}

export function createPagePlan(interiorPageCount = 24) {
  const pageCount = normalizePageCount(interiorPageCount);
  const storyRoles = createStoryRoles(pageCount);
  const pages = [{
    page_number: 1,
    page_type: "opening_text",
    spread_number: 0,
    scene_number: 0,
    story_role: "introduction",
    act: 1,
  }];

  storyRoles.forEach((storyRole, index) => {
    const leftPage = 2 + index * 2;
    const textOnLeft = index % 2 === 0;
    const sceneNumber = index + 1;
    const act = storyActForRole(storyRole, {
      index,
      total: storyRoles.length,
    });
    pages.push(
      {
        page_number: leftPage,
        page_type: textOnLeft ? "text" : "image",
        spread_number: sceneNumber,
        scene_number: sceneNumber,
        story_role: storyRole,
        act,
      },
      {
        page_number: leftPage + 1,
        page_type: textOnLeft ? "image" : "text",
        spread_number: sceneNumber,
        scene_number: sceneNumber,
        story_role: storyRole,
        act,
      }
    );
  });

  pages.push({
    page_number: pageCount,
    page_type: "closing_text",
    spread_number: storyRoles.length + 1,
    scene_number: storyRoles.length + 1,
    story_role: "dedication_and_closing",
    act: 3,
  });
  return pages;
}

export function applyPagePlan(blueprint, interiorPageCount = blueprint?.format?.interior_pages || 24, bookFormatId = blueprint?.format?.id) {
  const pageCount = normalizePageCount(interiorPageCount);
  const selectedFormat = findBookFormat(bookFormatId);
  const plan = createPagePlan(pageCount);
  const generated = Array.isArray(blueprint?.pages) ? blueprint.pages : [];
  const byNumber = new Map(generated.map((page) => [Number(page?.page_number), page]));

  blueprint.format = {
    ...(blueprint.format || {}),
    version: 1,
    id: selectedFormat.id,
    trim: selectedFormat.trim,
    width_mm: selectedFormat.widthMm,
    height_mm: selectedFormat.heightMm,
    interior_pages: pageCount,
    bleed_mm: selectedFormat.bleedMm,
  };
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
