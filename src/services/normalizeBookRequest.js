import {
  DEFAULT_STORY_ROLE_BY_PHOTO_ROLE,
  MAX_REFERENCE_PHOTOS,
  PHOTO_ROLES,
  PHOTO_STORY_ROLES,
} from "../config/questionnaire.js";
import { findIllustrationStyle } from "../config/illustrationStyles.js";
import { normalizeBookLanguage } from "../config/bookLanguages.js";
import { findUniverse, normalizePageCount, normalizeProductType, normalizeTypography } from "../config/bookOptions.js";
import { normalizeOutfitSelection } from "../config/outfitOptions.js";
import { findBookFormat } from "../config/bookFormats.js";
import { normalizePricingVersion } from "../config/productPricing.js";

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function legacyPhotoList(body) {
  const heroPhotoId = body?.heroPhotoId || body?.photos?.child_photo_id || body?.photos?.childPhotoId || null;
  const companionPhotoId = body?.photos?.companion_photo_id || body?.photos?.companionPhotoId || null;

  return [
    heroPhotoId && { id: heroPhotoId, role: "child", name: clean(body?.hero?.name || body?.answers?.hero_name), relationship: "hero" },
    companionPhotoId && { id: companionPhotoId, role: "mascot", name: clean(body?.companion?.name), relationship: "companion" },
  ].filter(Boolean);
}

export function normalizeReferencePhotos(body = {}, universeId = "enchanted_forest") {
  const raw = Array.isArray(body.photos) ? body.photos : legacyPhotoList(body);
  if (raw.length > MAX_REFERENCE_PHOTOS) {
    throw new Error(`A maximum of ${MAX_REFERENCE_PHOTOS} reference photos is allowed`);
  }

  const seen = new Set();
  const photos = raw.map((photo, index) => {
    const id = clean(photo?.id || photo?.photoId || photo?.fileId);
    if (!id) throw new Error(`Reference photo ${index + 1} is missing an id`);
    if (!/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error(`Reference photo ${index + 1} has an invalid id`);
    if (seen.has(id)) throw new Error(`Reference photo ${id} is duplicated`);
    seen.add(id);

    const role = clean(photo?.role || (index === 0 ? "child" : "other")).toLowerCase();
    if (!PHOTO_ROLES.includes(role)) throw new Error(`Unsupported photo role: ${role}`);
    const requestedStoryRole = clean(photo?.story_role || photo?.storyRole).toLowerCase();
    const storyRole = role === "child" ? "hero" : (requestedStoryRole || DEFAULT_STORY_ROLE_BY_PHOTO_ROLE[role]);
    if (!PHOTO_STORY_ROLES.includes(storyRole)) throw new Error(`Unsupported photo story role: ${storyRole}`);
    if (role !== "child" && storyRole === "hero") throw new Error("Only the child can have the hero story role");

    const storageKey = clean(photo?.storageKey || photo?.storage_key);
    if (storageKey && !/^reference-photos\/[a-zA-Z0-9._-]+$/.test(storageKey)) {
      throw new Error(`Reference photo ${index + 1} has an invalid storage key`);
    }
    const outfit = normalizeOutfitSelection({ ...photo, role }, universeId);
    return {
      id,
      storageKey,
      mimeType: clean(photo?.mimeType || photo?.mime_type),
      size: Number(photo?.size || 0) || 0,
      role,
      story_role: storyRole,
      name: clean(photo?.name),
      relationship: clean(photo?.relationship),
      participant_ref: clean(photo?.participant_ref || photo?.participantRef || id),
      outfit_preference: outfit.preference,
      outfit_id: outfit.outfitId,
      outfit_contract: outfit.resolvedDescription,
      outfit_selection_explicit: outfit.explicit,
    };
  });

  if (photos.filter((photo) => photo.role === "child").length > 1) {
    throw new Error("Only one reference photo can have the child role");
  }
  return photos;
}

export function normalizeBookRequest(body = {}) {
  const source = body.questionnaire || body.answers || {};
  const hero = body.hero || {};

  const selectedStyle = findIllustrationStyle(clean(source.style_id || body.style_id));
  const selectedUniverse = findUniverse(clean(source.universe_id || body.universe_id));
  const customStyle = clean(source.style || body.style);
  const customUniverse = clean(source.universe || body.universe);
  const answers = {
    hero_name: clean(source.hero_name || hero.name),
    age: clean(source.age || hero.age),
    gender: clean(source.gender || hero.gender),
    favorite_activities: clean(source.favorite_activities || source.passions),
    personality: clean(source.personality || source.character_traits),
    dream: clean(source.dream || source.wish || source.goal),
    challenge: clean(source.challenge || source.fear || source.difficulty),
    message: clean(source.message || body.message),
    universe_id: selectedUniverse.id,
    universe: customUniverse || selectedUniverse.name,
    universe_instructions: [selectedUniverse.prompt, clean(source.universe_details || body.universe_details)].filter(Boolean).join(". "),
    universe_story_contract: selectedUniverse.storyContract || {},
    story_seed_id: clean(source.story_seed_id),
    story_seed_approach: clean(source.story_seed_approach),
    story_seed_title: clean(source.story_seed_title),
    story_seed_starting_point: clean(source.story_seed_starting_point),
    story_seed_first_step: clean(source.story_seed_first_step),
    story_seed_effort: clean(source.story_seed_effort),
    story_seed_active_role: clean(source.story_seed_active_role),
    story_seed_reward: clean(source.story_seed_reward),
    story_seed_resolution: clean(source.story_seed_resolution),
    story_seed_adaptation: clean(source.story_seed_adaptation),
    story_seed_moment: clean(source.story_seed_moment),
    story_seed_transformation: clean(source.story_seed_transformation),
    story_seed_message: clean(source.story_seed_message),
    story_seed_emotional_tone: clean(source.story_seed_emotional_tone),
    story_seed_participant_refs: clean(source.story_seed_participant_refs),
    creator_situation: clean(source.creator_situation),
    story_intent_id: clean(source.story_intent_id),
    story_intent_title: clean(source.story_intent_title),
    story_intent_understanding: clean(source.story_intent_understanding),
    story_intent_desired_change: clean(source.story_intent_desired_change),
    story_intent_protective_doubt: clean(source.story_intent_protective_doubt),
    story_intent_first_step: clean(source.story_intent_first_step),
    story_intent_motivation: clean(source.story_intent_motivation),
    story_intent_reward: clean(source.story_intent_reward),
    story_intent_message: clean(source.story_intent_message),
    signature_object: clean(source.signature_object || body.signature_object),
    important_people: clean(source.important_people || source.companions),
    companion: clean(source.companion || body?.companion?.description || [body?.companion?.name, body?.companion?.type].filter(Boolean).join(" - ")),
    style_id: selectedStyle.id,
    style: customStyle || selectedStyle.name,
    style_instructions: customStyle || selectedStyle.prompt,
    rendering_mode: selectedStyle.renderingMode,
    likeness_goal: selectedStyle.likeness,
    language: normalizeBookLanguage(
      source.book_language
        || source.language
        || body.book_language
        || body.language
        || body.productConfiguration?.book_language
        || "FR",
    ),
    page_count: normalizePageCount(source.page_count || body.page_count),
    product_type: normalizeProductType(source.product_type || body.product_type),
    book_format_id: findBookFormat(
      source.book_format_id || body.book_format_id || body.productConfiguration?.book_format_id,
    ).id,
    pricing_version: normalizePricingVersion(
      source.pricing_version || body.pricing_version || body.productConfiguration?.pricing_version,
    ),
    font_style: normalizeTypography(source.font_style || body.font_style),
    extra_notes: clean(source.extra_notes || body.extra_notes),
  };

  if (!answers.hero_name) throw new Error("Missing hero name");
  if (!answers.age) throw new Error("Missing hero age");

  return { answers, photos: normalizeReferencePhotos(body, selectedUniverse.id) };
}
