import path from "path";
import { buildImageCharacterAliases, compactImageSceneContract, neutralizeImageText } from "./imageVisualContract.js";

const UPLOAD_DIR = path.resolve("data/uploads");

function key(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sameCharacter(left, right) {
  const a = key(left);
  const b = key(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function uploadedPhotoPath(photoId) {
  const filename = path.basename(String(photoId || ""));
  return filename ? path.join(UPLOAD_DIR, filename) : "";
}

function findPhotoCanon(characterCanons, name, role) {
  return characterCanons.find((canon) => sameCharacter(canon.name, name))
    || (["child", "mascot"].includes(role)
      ? characterCanons.find((canon) => canon.role === role)
      : undefined);
}

function selectedCharacters({ blueprint, characterCanons, castPresent, scenePrompt }) {
  const hero = { ...(blueprint.hero || {}), role: "child" };
  const byName = new Map();
  [hero, ...(blueprint.cast || [])].forEach((character) => {
    if (character?.name) byName.set(key(character.name), character);
  });
  characterCanons.forEach((canon) => {
    if (canon?.name && !byName.has(key(canon.name))) byName.set(key(canon.name), canon);
  });

  const requested = (castPresent || []).filter(Boolean);
  let selected = [...byName.values()].filter((character) => requested.some((name) => sameCharacter(name, character.name)));
  if (!requested.length) {
    const promptKey = key(scenePrompt);
    selected = [...byName.values()].filter((character) => promptKey.includes(key(character.name)));
  }
  if (!selected.length && hero.name) selected = [hero];
  return selected;
}

function isFullyUnderwaterScene(value) {
  return /(sous\s+l['’]eau|sous[- ]marine?|au\s+fond\s+de\s+l['’](?:eau|oc[eé]an)|parmi\s+les\s+coraux|underwater|fully\s+submerged|beneath\s+the\s+surface|on\s+the\s+seabed|debajo\s+del\s+agua|bajo\s+el\s+agua|sumergid[oa]s?|fondo\s+del\s+oc[eé]ano)/iu.test(String(value || ""));
}

export function buildSceneContinuity({
  blueprint,
  characterCanons = [],
  castPresent = [],
  scenePrompt = "",
  visualState = {},
  continuityImagePath = "",
  continuityImageStorageKey = "",
  pairedText = "",
  structuredSceneContract = null,
  wardrobeLocks = [],
  referenceAssets = new Map(),
}) {
  const selected = selectedCharacters({ blueprint, characterCanons, castPresent, scenePrompt });
  const visualAliases = buildImageCharacterAliases({ blueprint, characterCanons, castPresent });
  const safe = (value) => neutralizeImageText(value, visualAliases).trim();
  const identityFor = (name) => visualAliases.find((item) => sameCharacter(item.name, name));
  const aliasFor = (name) => identityFor(name)?.alias || safe(name);
  const characterFingerprints = [];
  const identityReferenceImages = [];

  for (const character of selected) {
    const role = character.role || (sameCharacter(character.name, blueprint?.hero?.name) ? "child" : "other");
    const photoCanon = findPhotoCanon(characterCanons, character.name, role);
    const traits = [photoCanon?.character_fingerprint, character.canon_short].filter(Boolean).join(" ");
    const sceneWardrobe = wardrobeLocks.find((item) => sameCharacter(item?.name, character.name))?.outfit;
    const outfit = sceneWardrobe || (role === "child"
      ? (blueprint?.hero?.outfit_lock || photoCanon?.outfit_lock || "")
      : (character.outfit_lock || photoCanon?.outfit_lock || ""));
    const visualAlias = aliasFor(character.name);
    const visualIdentity = identityFor(character.name);
    const rules = [
      `[${role.toUpperCase()} ${visualAlias}]`,
      visualIdentity?.entity_type === "animal"
        && `NON-HUMAN ANIMAL IDENTITY: depict one complete ${visualIdentity.species || "animal"} body with species-correct head, face, limbs and proportions. Never depict this companion as a human child or person.`,
      visualIdentity?.entity_type === "plush_toy"
        && `PLUSH TOY IDENTITY: depict one complete ${visualIdentity.species || "animal"} plush toy body. Never depict this companion as a human child, living person or human-animal hybrid.`,
      traits && `IDENTITY: ${safe(traits)}`,
      outfit && `FIXED OUTFIT FOR CURRENT SCENE: ${safe(outfit)}. Keep this exact generic wardrobe stable in the current scene. A different declared wardrobe state on another scene is intentional.`,
      role === "mascot" && "SPECIES LOCK: keep the exact same animal species, coat colors, markings, ears, muzzle, tail and accessories; never reinterpret it as another animal or a famous character.",
    ].filter(Boolean);
    characterFingerprints.push(rules.join(" "));

    if (photoCanon?.photoId || photoCanon?.storageKey) {
      const privateAsset = referenceAssets.get(String(photoCanon.photoId));
      identityReferenceImages.push({
        ...(privateAsset?.buffer
          ? { buffer: privateAsset.buffer }
          : photoCanon.storageKey
            ? { storageKey: photoCanon.storageKey }
            : { path: uploadedPhotoPath(photoCanon.photoId) }),
        label: `${visualAlias}, ${role}: private identity-only reference; preserve stable face or animal traits faithfully, but never copy this photo's rendering medium, lighting, background or undeclared wardrobe`,
        kind: "identity",
        normalizationMode: continuityImagePath || continuityImageStorageKey ? "face_focus" : "full_and_face",
      });
    }
  }

  const continuityReference = continuityImagePath || continuityImageStorageKey
    ? {
      ...(continuityImagePath ? { path: continuityImagePath } : { storageKey: continuityImageStorageKey }),
      label: "approved-cover visual bible and primary style anchor: preserve this exact broad rendering family, artistic medium, character proportions, world treatment and palette; wardrobe must follow the current scene directive",
      kind: "continuity",
    }
    : null;
  // The approved cover must be Reference 1. Raw photos are identity evidence
  // only and must never outvote the book's already approved visual language.
  const referenceImages = [continuityReference, ...identityReferenceImages].filter(Boolean);

  const castNames = selected.map((character) => aliasFor(character.name)).filter(Boolean);
  const sceneRules = [];
  if (structuredSceneContract) {
    sceneRules.push(
      "The compact visual specification is authoritative for the current scene.",
      "Its main-action subject must visibly perform the stated verb toward the stated target.",
      "A generic character id is a distinct one-scene person and must never be replaced by a recurring named character or photo reference.",
      "Respect every required quantity and scale literally, and show none of the forbidden substitutions."
    );
  }
  if (castNames.length) {
    sceneRules.push(
      `MANDATORY VISIBLE CAST (${castNames.length}): ${castNames.join(", ")}.`,
      "Every listed character must be clearly visible, recognizable and present at the same time.",
      "Do not omit, merge, replace or transform any listed character, even when several reference images are supplied.",
      "One listed character equals one complete separate body and one coherent identity. Never attach one character's face or head to another character's body or species.",
      "Do not add another recurring named book character who is not in the mandatory cast."
    );
  }
  const nonHumanCast = selected
    .map((character) => identityFor(character.name))
    .filter((identity) => ["animal", "plush_toy"].includes(identity?.entity_type));
  if (nonHumanCast.length) {
    sceneRules.push(
      `NON-HUMAN CAST LOCK (${nonHumanCast.length}): ${nonHumanCast.map((identity) => `${identity.alias}${identity.species ? ` = ${identity.species}` : ""}`).join(", ")}.`,
      "Every listed non-human companion must remain visibly non-human with one complete species-correct animal or plush-toy body. Never substitute a human child, teenager or adult for any of them."
    );
  }
  if (visualState?.directive) sceneRules.push(safe(visualState.directive));
  const underwaterScene = isFullyUnderwaterScene(`${pairedText} ${scenePrompt}`);
  const underwaterPeople = selected.filter((character) => !["animal", "plush_toy"].includes(identityFor(character.name)?.entity_type));
  if (underwaterScene && underwaterPeople.length) {
    const names = underwaterPeople.map((character) => aliasFor(character.name)).filter(Boolean);
    sceneRules.push(
      `MANDATORY INDIVIDUAL UNDERWATER SAFETY (${names.length} people: ${names.join(", ")}): every listed person must individually have a complete visible breathing or story-established magical air mechanism.`,
      "Apply the same safety logic to every person, not only the hero. If one person wears a transparent diving helmet, bubble, mask-and-snorkel or other established mechanism, every other submerged person must have their own complete appropriate mechanism too.",
      "No listed person may appear bare-headed and breathing normally underwater. Do not merge two people's equipment into one shared object."
    );
  }
  return {
    characterFingerprints,
    referenceImages,
    sceneContract: sceneRules.filter(Boolean).join("\n"),
    sceneFidelityContract: structuredSceneContract
      ? compactImageSceneContract(structuredSceneContract, visualAliases)
      : null,
    visualAliases,
  };
}
