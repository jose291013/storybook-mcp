function key(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function names(character = {}) {
  return [character.name, character.canonicalName, character.displayName,
    ...(Array.isArray(character.aliases) ? character.aliases : [])].map(key).filter(Boolean);
}

function id(character = {}) {
  return character.character_id || character.characterId || character.id || "";
}

function isHeroProjection(character, hero, registry) {
  // The blueprint schema permits the hero both in `hero` and in `cast`.
  // That narrative projection is not a second private identity source. Only
  // collapse it with positive hero evidence, never merely a shared first name.
  const heroId = id(hero) || "character_hero";
  if (id(character) && id(character) !== heroId) return false;
  if (character.role && character.role !== "child") return false;
  if (character.story_role && character.story_role !== "hero") return false;
  for (const field of ["photoId", "storageKey", "profileRef"]) {
    if (character[field] && character[field] !== hero[field]) return false;
  }
  const exactHeroId = id(character) === heroId;
  if (!exactHeroId && registry.some((entry) => id(entry) !== heroId
    && names(entry).some((name) => names(character).includes(name)))) return false;
  const heroRole = character.role === "child" || character.story_role === "hero";
  return exactHeroId || (heroRole && names(character).some((name) => names(hero).includes(name)));
}

// Identity joins are exact after normalization. A substring such as Ann/Anna
// must never transfer another person's wardrobe or private photo.
export function findSceneCharacter(character, candidates = []) {
  const characterId = id(character);
  const byId = characterId ? candidates.filter((entry) => id(entry) === characterId) : [];
  const expectedNames = names(character);
  const matches = byId.length ? byId : candidates.filter((entry) => (
    (!id(entry) || !characterId || id(entry) === characterId)
    && names(entry).some((name) => expectedNames.includes(name))
  ));
  if (matches.length > 1) {
    const error = new Error("A canonical scene character has ambiguous visual identity sources.");
    error.code = "scene_render_character_binding_ambiguous";
    error.characterId = characterId;
    throw error;
  }
  return matches[0];
}

export function bindSceneCharacters({ blueprint, characterCanons, sceneContract }) {
  const registry = sceneContract.character_registry || [];
  const hero = { ...(blueprint.hero || {}), role: "child" };
  // Keep the dedicated hero's wardrobe/description authoritative. Do not merge
  // photo canons: two matching private sources must still fail closed below.
  const blueprintCast = [hero, ...(blueprint.cast || []).filter((entry) => (
    !hero.name || !isHeroProjection(entry, hero, registry)
  ))].filter((entry) => entry.name);
  return (sceneContract.visible_character_ids || []).map((characterId) => {
    const canonical = registry.find((entry) => entry.character_id === characterId);
    const resolve = (subject, candidates, sourcePath) => {
      try {
        return findSceneCharacter(subject, candidates);
      } catch (error) {
        // Bounded diagnostics identify the failing source, not private names,
        // fingerprints or photo paths. The existing preview logger emits these.
        error.characterId = characterId;
        error.pageNumber = sceneContract.image_page_number;
        error.issues = [{ keyword: "identity_binding", path: sourcePath,
          pageNumber: error.pageNumber, message: error.message }];
        throw error;
      }
    };
    const fromBlueprint = (subject) => resolve(subject, blueprintCast, "/blueprint/characters");
    const fromPhotos = (subject) => resolve(subject, characterCanons, "/characterCanons");
    let character = canonical && fromBlueprint(canonical);
    let photoCanon = canonical && fromPhotos(canonical);
    if (!character && photoCanon) character = fromBlueprint(photoCanon);
    if (!photoCanon && character) photoCanon = fromPhotos(character);
    // The hero role is a unique, durable identity even when a legacy blueprint
    // used a nickname. Never use a role-only fallback for another participant.
    if (canonical && characterId === "character_hero") {
      character ||= hero.name ? hero : null;
      photoCanon ||= fromPhotos({ name: "", character_id: characterId })
        || (characterCanons.filter((entry) => entry.role === "child").length === 1
          ? characterCanons.find((entry) => entry.role === "child") : null);
    }
    const source = character || photoCanon;
    if (!canonical || !source) {
      const error = new Error("A visible canonical character has no visual identity binding.");
      error.code = "scene_render_visible_character_unbound";
      error.characterId = characterId;
      error.pageNumber = sceneContract.image_page_number;
      throw error;
    }
    return {
      ...source,
      character_id: characterId,
      name: canonical.name,
      sourceName: source.name,
      photoCanon,
    };
  });
}
