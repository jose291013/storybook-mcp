import {
  DEFAULT_STORY_ROLE_BY_PHOTO_ROLE,
  MAX_REFERENCE_PHOTOS,
  PHOTO_ROLES,
  PHOTO_STORY_ROLES,
} from "../config/questionnaire.js";
import { findIllustrationStyle } from "../config/illustrationStyles.js";
import { normalizeBookLanguage } from "../config/bookLanguages.js";
import { findUniverse, normalizePageCount, normalizeProductType, normalizeTypography } from "../config/bookOptions.js";

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

export function normalizeReferencePhotos(body = {}) {
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

    return { id, role, story_role: storyRole, name: clean(photo?.name), relationship: clean(photo?.relationship) };
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
    signature_object: clean(source.signature_object || body.signature_object),
    important_people: clean(source.important_people || source.companions),
    companion: clean(source.companion || body?.companion?.description || [body?.companion?.name, body?.companion?.type].filter(Boolean).join(" - ")),
    style_id: selectedStyle.id,
    style: customStyle || selectedStyle.name,
    style_instructions: customStyle || selectedStyle.prompt,
    language: normalizeBookLanguage(source.language || body.language || "FR"),
    page_count: normalizePageCount(source.page_count || body.page_count),
    product_type: normalizeProductType(source.product_type || body.product_type),
    font_style: normalizeTypography(source.font_style || body.font_style),
    extra_notes: clean(source.extra_notes || body.extra_notes),
  };

  if (!answers.hero_name) throw new Error("Missing hero name");
  if (!answers.age) throw new Error("Missing hero age");

  return { answers, photos: normalizeReferencePhotos(body) };
}
