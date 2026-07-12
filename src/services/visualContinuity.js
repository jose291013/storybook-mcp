import path from "path";

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

export function buildSceneContinuity({
  blueprint,
  characterCanons = [],
  castPresent = [],
  scenePrompt = "",
  continuityImagePath = "",
}) {
  const selected = selectedCharacters({ blueprint, characterCanons, castPresent, scenePrompt });
  const characterFingerprints = [];
  const referenceImages = [];

  for (const character of selected) {
    const role = character.role || (sameCharacter(character.name, blueprint?.hero?.name) ? "child" : "other");
    const photoCanon = findPhotoCanon(characterCanons, character.name, role);
    const traits = [photoCanon?.character_fingerprint, character.canon_short].filter(Boolean).join(" ");
    const outfit = role === "child"
      ? (blueprint?.hero?.outfit_lock || photoCanon?.outfit_lock || "")
      : (character.outfit_lock || photoCanon?.outfit_lock || "");
    const rules = [
      `[${role.toUpperCase()} ${character.name}]`,
      traits && `IDENTITY: ${traits}`,
      outfit && `FIXED OUTFIT: ${outfit}. Keep every color, garment and accessory exactly unchanged on every page.`,
      role === "mascot" && "SPECIES LOCK: keep the exact same animal species, coat colors, markings, ears, muzzle, tail and accessories; never reinterpret it as another animal or a famous character.",
    ].filter(Boolean);
    characterFingerprints.push(rules.join(" "));

    if (photoCanon?.photoId) {
      referenceImages.push({
        path: uploadedPhotoPath(photoCanon.photoId),
        label: `${character.name}, ${role}: primary identity reference; preserve face or animal traits faithfully`,
      });
    }
  }

  if (continuityImagePath) {
    referenceImages.push({
      path: continuityImagePath,
      label: "approved book continuity frame: preserve the established illustration style, character proportions, outfits and mascot design only",
    });
  }

  return { characterFingerprints, referenceImages };
}
