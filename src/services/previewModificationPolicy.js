function text(value) {
  return String(value || "").trim();
}

function normalized(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const INTRODUCTION_CUE = /\b(ajout(?:e|er|ez)?|inclu(?:re|s|se|ant)|integr(?:e|er|ez)|montr(?:e|er|ez)|faire apparaitre|apparaitre|represent(?:e|er)|remplac(?:e|er).* par|anad(?:e|ir)|agreg(?:a|ar)|inclu(?:ye|ir)|integr(?:a|ar)|muestr(?:a|e|ar)|hacer aparecer|represent(?:a|ar)|sustitu(?:ye|ir).* por|add|include|introduce|show|feature|make .* appear|replace .* with)\b/i;
const GENERIC_CHARACTER = /\b(grand mere|grand pere|grandma|grandmother|grandfather|grandpa|abuela|abuelo|maman|mama|mere|mother|mom|mum|papa|pere|father|dad|frere|soeur|brother|sister|ami|amie|friend|garcon|fille|boy|girl|enfant|child|bebe|baby|femme|woman|homme|man|personne|person|personnage|character|chien|dog|chat|cat|animal|mascotte|mascot)\b/i;
const NAMED_CHARACTER_INTRODUCTION = /\b(?:ajouter|inclure|intégrer|montrer|faire apparaître|añadir|agregar|incluir|integrar|mostrar|hacer aparecer|add|include|introduce|show|feature)\s+(?:(?:l['’]image|une image|le portrait|la photo|la imagen|el retrato|an image|a picture|the portrait)\s+(?:de|of)\s+)?([A-ZÀ-ÖØ-Ý][\p{L}'’-]{2,})/iu;

function wordMention(haystack, name) {
  const target = normalized(name);
  if (!target) return false;
  return ` ${haystack} `.includes(` ${target} `);
}

function sceneForSpread(project, spreadNumber) {
  const pages = Array.isArray(project?.finalBlueprint?.pages) ? project.finalBlueprint.pages : [];
  const imagePage = pages.find((page) => (
    page?.page_type === "image" && Number(page?.spread_number) === Number(spreadNumber)
  ));
  const approvedScenario = project?.finalBlueprint?.approved_scenario;
  const scene = (Array.isArray(approvedScenario?.scenes) ? approvedScenario.scenes : [])
    .find((item) => Number(item?.sceneNumber) === Number(imagePage?.scene_number));
  return { imagePage, approvedScenario, scene };
}

export function inspectPreviewModificationRequest({ project, spreadNumber, instruction }) {
  const request = normalized(instruction);
  if (!INTRODUCTION_CUE.test(request)) return { allowed: true };
  const namedCandidate = text(instruction).match(NAMED_CHARACTER_INTRODUCTION)?.[1] || "";
  const namedIntroduction = /^[A-ZÀ-ÖØ-Ý]/u.test(namedCandidate) ? namedCandidate : "";

  const { imagePage, approvedScenario, scene } = sceneForSpread(project, spreadNumber);
  const allowedNames = new Set([
    ...(Array.isArray(imagePage?.cast_present) ? imagePage.cast_present : []),
    ...(Array.isArray(scene?.characterPresences) ? scene.characterPresences.map((presence) => presence?.name) : []),
  ].map(normalized).filter(Boolean));
  const canonicalCharacters = Array.isArray(approvedScenario?.characters) ? approvedScenario.characters : [];
  const outsideCharacter = canonicalCharacters.find((character) => (
    wordMention(request, character?.name) && !allowedNames.has(normalized(character?.name))
  ));
  const introducedName = outsideCharacter?.name
    || (namedIntroduction && !allowedNames.has(normalized(namedIntroduction)) ? namedIntroduction : "");
  if (introducedName || GENERIC_CHARACTER.test(request)) {
    return {
      allowed: false,
      code: "preview_modification_requires_full_preview",
      reason: "character_change",
      characterName: text(introducedName),
      noCreditReserved: true,
    };
  }
  return { allowed: true };
}
