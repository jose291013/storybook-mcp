export const STORY_CAST_PARTICIPATION_VERSION = 1;

const ROLE_REQUIREMENTS = Object.freeze({
  hero: { meaningfulScenes: 1, physicalScenes: 1 },
  guide: { meaningfulScenes: 2, physicalScenes: 0 },
  ally: { meaningfulScenes: 2, physicalScenes: 1 },
  companion: { meaningfulScenes: 3, physicalScenes: 2 },
  supporter: { meaningfulScenes: 2, physicalScenes: 1 },
  guest: { meaningfulScenes: 1, physicalScenes: 1 },
});

function clean(value) {
  return String(value || "").trim();
}

function key(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export function buildStoryCastParticipationContract(characters = [], sceneCount = 0) {
  const maximumScenes = Math.max(1, Number(sceneCount || 0));
  const participants = list(characters).map((character) => {
    const name = clean(character?.name);
    const storyRole = clean(character?.storyRole || character?.story_role || "guest").toLowerCase();
    const requirements = ROLE_REQUIREMENTS[storyRole] || ROLE_REQUIREMENTS.guest;
    return {
      name,
      storyRole,
      relationship: clean(character?.relationship),
      minimumMeaningfulScenes: Math.min(maximumScenes, requirements.meaningfulScenes),
      minimumPhysicalScenes: Math.min(maximumScenes, requirements.physicalScenes),
    };
  }).filter((participant, index, all) => (
    participant.name
    && all.findIndex((candidate) => key(candidate.name) === key(participant.name)) === index
  ));

  return {
    version: STORY_CAST_PARTICIPATION_VERSION,
    source: "creator_cast",
    participants,
  };
}

export function validateStoryCastParticipation(scenario = {}) {
  const contract = scenario?.castParticipationContract;
  if (Number(contract?.version) !== STORY_CAST_PARTICIPATION_VERSION) return [];

  const scenes = list(scenario?.scenes);
  const issues = [];
  for (const participant of list(contract?.participants)) {
    const participantKey = key(participant?.name);
    if (!participantKey) continue;
    const meaningfulScenes = scenes.filter((scene) => list(scene?.characterPresences).some((presence) => (
      key(presence?.name) === participantKey && clean(presence?.action)
    )));
    const physicalScenes = scenes.filter((scene) => list(scene?.characterPresences).some((presence) => (
      key(presence?.name) === participantKey
      && clean(presence?.action)
      && presence?.mode === "physical"
    )));
    const minimumMeaningful = Math.max(0, Number(participant?.minimumMeaningfulScenes || 0));
    const minimumPhysical = Math.max(0, Number(participant?.minimumPhysicalScenes || 0));
    const role = clean(participant?.storyRole || "guest");

    if (meaningfulScenes.length < minimumMeaningful) {
      issues.push(
        `cast participant ${clean(participant.name)} (${role}) needs at least ${minimumMeaningful} meaningful scene presences; found ${meaningfulScenes.length}`,
      );
    }
    if (physicalScenes.length < minimumPhysical) {
      issues.push(
        `cast participant ${clean(participant.name)} (${role}) needs at least ${minimumPhysical} physical scene presences; found ${physicalScenes.length}`,
      );
    }
  }
  return issues;
}

export function storyCastParticipationSummary(scenario = {}) {
  const scenes = list(scenario?.scenes);
  return list(scenario?.castParticipationContract?.participants).map((participant) => {
    const participantKey = key(participant?.name);
    const presences = scenes.flatMap((scene) => list(scene?.characterPresences)
      .filter((presence) => key(presence?.name) === participantKey)
      .map((presence) => ({ sceneNumber: Number(scene?.sceneNumber || 0), mode: presence?.mode })));
    return {
      ...participant,
      sceneNumbers: [...new Set(presences.map((presence) => presence.sceneNumber).filter(Boolean))],
      physicalSceneNumbers: [...new Set(presences
        .filter((presence) => presence.mode === "physical")
        .map((presence) => presence.sceneNumber)
        .filter(Boolean))],
    };
  });
}
