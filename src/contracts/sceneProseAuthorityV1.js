export const SCENE_PROSE_AUTHORITY_VERSION = 1;

function unique(values = []) {
  return [...new Set(values.filter(Boolean))].sort();
}

function normalized(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
}

function exactMention(text, term) {
  const candidate = normalized(term);
  if (!candidate) return false;
  const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u").test(normalized(text));
}

export function characterMentionTerms(character = {}) {
  return unique([
    character.displayName,
    character.canonicalName,
    character.familyAddress,
    character.name,
  ].map((value) => String(value || "").trim()));
}

export function mentionedCharacterIds(text, characters = []) {
  return characters
    .filter((character) => characterMentionTerms(character).some((term) => exactMention(text, term)))
    .map((character) => character.id)
    .filter(Boolean)
    .sort();
}

export function compileSceneProseAuthority({ spec: rawSpec, sceneNumber = 0 } = {}) {
  const spec = rawSpec;
  if (!spec || !Array.isArray(spec.scenes) || !Array.isArray(spec?.registries?.characters)) return null;
  const scene = spec.scenes.find((entry) => entry.sceneNumber === Number(sceneNumber));
  if (!scene) return null;
  const physicalCharacterIds = unique((scene.presences || [])
    .filter((presence) => presence.mode === "physical")
    .map((presence) => presence.characterId));
  const evokedCharacterIds = unique((scene.presences || [])
    .filter((presence) => presence.mode === "evoked")
    .map((presence) => presence.characterId));
  const allowedCharacterIds = unique([...physicalCharacterIds, ...evokedCharacterIds]);
  const travelerCharacterIds = unique([
    ...(scene.transition?.travelerCharacterIds || []),
    ...(scene.movements || []).flatMap((movement) => movement.travelerCharacterIds || []),
  ]);
  const contextualTravelerCharacterIds = travelerCharacterIds
    .filter((characterId) => !allowedCharacterIds.includes(characterId));
  const forbiddenCharacterIds = spec.registries.characters
    .map((character) => character.id)
    .filter((characterId) => !allowedCharacterIds.includes(characterId))
    .sort();
  const allowedCharacters = spec.registries.characters
    .filter((character) => allowedCharacterIds.includes(character.id))
    .map((character) => ({
      id: character.id,
      display_name: character.displayName,
      family_address: character.familyAddress || "",
      mention_terms: characterMentionTerms(character),
      presence_mode: physicalCharacterIds.includes(character.id) ? "physical" : "evoked",
    }));
  return Object.freeze({
    version: SCENE_PROSE_AUTHORITY_VERSION,
    scene_number: scene.sceneNumber,
    allowed_physical_character_ids: physicalCharacterIds,
    allowed_evoked_character_ids: evokedCharacterIds,
    allowed_character_ids: allowedCharacterIds,
    contextual_traveler_character_ids: contextualTravelerCharacterIds,
    forbidden_character_ids: forbiddenCharacterIds,
    allowed_characters: allowedCharacters,
  });
}

export function sceneProseCharacterIssues({ spec: rawSpec, sceneNumber = 0, text = "", pageNumber = null } = {}) {
  const spec = rawSpec;
  if (!spec || !Array.isArray(spec?.registries?.characters)) return [];
  const authority = compileSceneProseAuthority({ spec, sceneNumber });
  if (!authority) return [];
  const observedCharacterIds = mentionedCharacterIds(text, spec.registries.characters);
  const unexpectedCharacterIds = observedCharacterIds
    .filter((characterId) => !authority.allowed_character_ids.includes(characterId));
  if (!unexpectedCharacterIds.length) return [];
  return [{
    code: "manuscript_character_fact_unregistered",
    keyword: "characterMentions",
    path: `/pages/${pageNumber ?? sceneNumber}/observedCharacterMentionIds`,
    pageNumber: pageNumber == null ? null : Number(pageNumber),
    sceneNumber: Number(sceneNumber),
    observedCharacterIds,
    unexpectedCharacterIds,
    allowedCharacterIds: authority.allowed_character_ids,
    message: `Named character mentions are not registered for this exact scene: ${unexpectedCharacterIds.join(", ")}.`,
  }];
}
