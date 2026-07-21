import { commerceOrderStore } from "./commerceOrderStore.js";
import { projectStore } from "./projectStore.js";
import { seriesStore } from "./seriesStore.js";

export class SeriesPurchaseRequiredError extends Error {
  constructor() {
    super("A purchased digital book is required to continue this series");
    this.code = "series_purchase_required";
  }
}

function heroProfile(project) {
  const answers = project.questionnaire || {};
  return {
    name: answers.hero_name || project.title || "",
    age: answers.age || "",
    personality: answers.personality || "",
    favoriteActivities: answers.favorite_activities || "",
    signatureObject: answers.signature_object || answers.personal_detail || "",
  };
}

function canonicalMemory(project) {
  return {
    hero: heroProfile(project),
    universe: project.productConfiguration?.universe_id || project.questionnaire?.universe_id || "",
    illustrationStyle: project.productConfiguration?.style_id || project.questionnaire?.style_id || "",
    bookLanguage: project.locale || "FR",
    latestPurchasedProjectId: project.id,
  };
}

function characterCanon(photo) {
  return {
    referencePhotoId: photo.id || null,
    storageKey: photo.storageKey || "",
    relationship: photo.relationship || "",
  };
}

async function ensureSeriesFoundation(source, stores) {
  if (source.seriesId && source.childProfileId) {
    const existingSeries = await stores.series.getSeries(source.seriesId);
    const existingProfile = await stores.series.getChildProfile(source.childProfileId);
    if (existingSeries && existingProfile) return { series: existingSeries, childProfile: existingProfile };
  }

  const profile = heroProfile(source);
  const childProfile = await stores.series.createChildProfile({
    customerId: source.customerId,
    displayName: profile.name || "Enfant",
    profileData: profile,
  });
  const series = await stores.series.createSeries({
    customerId: source.customerId,
    childProfileId: childProfile.id,
    title: profile.name ? `${profile.name} — Aventures` : "Mes aventures",
    memoryData: canonicalMemory(source),
  });
  for (const photo of source.photoRefs || []) {
    await stores.series.addCharacter({
      customerId: source.customerId,
      childProfileId: childProfile.id,
      seriesId: series.id,
      name: photo.name || "",
      role: photo.role || "other",
      storyRole: photo.storyRole || photo.story_role || "guest",
      canonData: characterCanon(photo),
    });
  }
  await stores.projects.update(source.id, {
    childProfileId: childProfile.id,
    seriesId: series.id,
    episodeNumber: source.episodeNumber || 1,
    expiresAt: null,
  });
  return { series, childProfile };
}

export async function createNextAdventure({ sourceProject, stores = {} }) {
  const activeStores = {
    projects: stores.projects || projectStore,
    series: stores.series || seriesStore,
    orders: stores.orders || commerceOrderStore,
  };
  if (!sourceProject?.customerId) throw new Error("Authenticated source project required");
  const purchased = await activeStores.orders.hasPaidEbookPurchase({
    projectId: sourceProject.id,
    customerId: sourceProject.customerId,
  });
  if (!purchased) throw new SeriesPurchaseRequiredError();

  const existingDraft = await activeStores.projects.findDerivedDraft(sourceProject.id, sourceProject.customerId);
  if (existingDraft) return { project: existingDraft, reused: true };

  const foundation = await ensureSeriesFoundation(sourceProject, activeStores);
  const episodes = await activeStores.projects.listForSeries(foundation.series.id, sourceProject.customerId);
  const episodeNumber = Math.max(1, ...episodes.map((item) => Number(item.episodeNumber || 0))) + 1;
  const characters = await activeStores.series.listCharacters(foundation.series.id);
  const continuitySnapshot = {
    seriesContext: {
      seriesId: foundation.series.id,
      title: foundation.series.title,
      sourceProjectId: sourceProject.id,
      previousEpisodeNumber: sourceProject.episodeNumber || 1,
      stableHero: foundation.childProfile.profileData || heroProfile(sourceProject),
      canonicalCharacters: characters.map((character) => ({
        name: character.name,
        role: character.role,
        storyRole: character.storyRole,
        relationship: character.canonData?.relationship || "",
      })),
    },
  };
  await activeStores.series.addFact({
    seriesId: foundation.series.id,
    sourceProjectId: sourceProject.id,
    factKey: "purchased_episode",
    factData: { episodeNumber: sourceProject.episodeNumber || 1, title: sourceProject.title || "" },
  });
  try {
    const project = await activeStores.projects.create({
      customerId: sourceProject.customerId,
      childProfileId: foundation.childProfile.id,
      seriesId: foundation.series.id,
      episodeNumber,
      sourceProjectId: sourceProject.id,
      status: "draft",
      title: sourceProject.title || sourceProject.questionnaire?.hero_name || "",
      locale: sourceProject.locale || "FR",
      questionnaire: structuredClone(sourceProject.questionnaire || {}),
      photoRefs: structuredClone(sourceProject.photoRefs || []),
      productConfiguration: structuredClone(sourceProject.productConfiguration || {}),
      continuitySnapshot,
      expiresAt: null,
    });
    return { project, reused: false, series: foundation.series };
  } catch (error) {
    const concurrent = await activeStores.projects.findDerivedDraft(sourceProject.id, sourceProject.customerId);
    if (concurrent) return { project: concurrent, reused: true, series: foundation.series };
    throw error;
  }
}
