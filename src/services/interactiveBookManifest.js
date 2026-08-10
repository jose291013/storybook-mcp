import path from "path";
import { privatePreviewAssetUrl } from "./previewAssetStorage.js";

const LANGUAGE_TAGS = { FR: "fr-FR", ES: "es-ES", EN: "en-GB" };
const COPY = {
  fr: { cover: "Couverture", opening: "Introduction", closing: "Pour toi", scene: "Scène", of: "sur", coverAlt: "Couverture de", sceneAlt: "Illustration de la scène" },
  es: { cover: "Portada", opening: "Introducción", closing: "Para ti", scene: "Escena", of: "de", coverAlt: "Portada de", sceneAlt: "Ilustración de la escena" },
  en: { cover: "Cover", opening: "Introduction", closing: "For you", scene: "Scene", of: "of", coverAlt: "Cover of", sceneAlt: "Illustration for scene" },
};

export class InteractiveBookUnavailableError extends Error {
  constructor(issues = []) {
    super(issues.join(" | ") || "Interactive book is unavailable");
    this.name = "InteractiveBookUnavailableError";
    this.issues = issues;
  }
}

function languageTag(value) {
  const raw = String(value || "FR").trim();
  return LANGUAGE_TAGS[raw.toUpperCase()] || (/^[a-z]{2}(?:-[A-Z]{2})?$/.test(raw) ? raw : "fr-FR");
}

function privateAsset(projectId, url, storageKey) {
  const expectedPrefix = `/api/projects/${encodeURIComponent(projectId)}/preview-assets/`;
  const pathname = new URL(String(url || ""), "http://localhost").pathname;
  if (pathname.startsWith(expectedPrefix)) return pathname;
  const filename = storageKey ? path.posix.basename(String(storageKey).replaceAll("\\", "/")) : "";
  return filename ? privatePreviewAssetUrl(projectId, filename) : "";
}

function pageNumber(page) {
  return Number(page?.page_number || 0);
}

function pageType(page) {
  return String(page?.page_type || "").trim();
}

export function buildInteractiveBookManifest(project) {
  const blueprint = project?.finalBlueprint;
  const preview = project?.previewResult;
  const draftPages = Array.isArray(preview?.draftPages) ? preview.draftPages : [];
  const blueprintPages = Array.isArray(blueprint?.pages) ? blueprint.pages : [];
  const issues = [];

  if (!project?.id) issues.push("Project identity is missing");
  if (!blueprint) issues.push("Final blueprint is missing");
  if (!preview) issues.push("Completed preview is missing");
  if (!draftPages.length) issues.push("Preview pages are missing");
  if (issues.length) throw new InteractiveBookUnavailableError(issues);

  const title = String(blueprint.cover?.title || project.title || "Calitiki").trim();
  const language = languageTag(blueprint.language || project.questionnaire?.language || project.locale);
  const copy = COPY[language.slice(0, 2)] || COPY.fr;
  const byNumber = new Map(draftPages.map((page) => [pageNumber(page), page]));
  const blueprintByNumber = new Map(blueprintPages.map((page) => [pageNumber(page), page]));
  const sections = [];

  const coverImage = privateAsset(project.id, preview.coverPreviewUrl, preview.coverStorageKey);
  if (!coverImage) issues.push("Private cover asset is missing");
  else sections.push({
    id: "cover",
    kind: "cover",
    text: title,
    image: coverImage,
    alt: `${copy.coverAlt} ${title}`,
    progressLabel: copy.cover,
  });

  const opening = draftPages.find((page) => pageType(page) === "opening_text");
  if (!String(opening?.text || "").trim()) issues.push("Opening text is missing");
  else sections.push({
    id: "opening",
    kind: "text_only",
    text: String(opening.text).trim(),
    progressLabel: copy.opening,
  });

  const spreads = new Map();
  draftPages.forEach((page) => {
    const spread = Number(page.spread_number || blueprintByNumber.get(pageNumber(page))?.spread_number || 0);
    if (spread <= 0 || ["opening_text", "closing_text"].includes(pageType(page))) return;
    if (!spreads.has(spread)) spreads.set(spread, []);
    spreads.get(spread).push(page);
  });
  const orderedSpreads = [...spreads.entries()].sort(([left], [right]) => left - right);

  orderedSpreads.forEach(([spread, pages], index) => {
    const textPage = pages.find((page) => pageType(page) === "text");
    const imagePage = pages.find((page) => pageType(page) === "image");
    const text = String(textPage?.text || "").trim();
    // The composed preview is the authoritative 21 x 21 cm page seen by the
    // creator and used for print. Prefer it so the interactive reader preserves
    // that exact square framing; the raw image remains a legacy fallback.
    const image = privateAsset(
      project.id,
      imagePage?.previewUrl || imagePage?.imageUrl,
      imagePage?.storageKey || imagePage?.imageStorageKey,
    );
    if (!text || !image) {
      issues.push(`Spread ${spread} is missing ${!text ? "text" : "its private illustration"}`);
      return;
    }
    const blueprintPage = blueprintByNumber.get(pageNumber(imagePage)) || {};
    const sceneNumber = Number(blueprintPage.scene_number || spread || index + 1);
    sections.push({
      id: `scene-${sceneNumber}`,
      kind: "scene",
      sceneNumber,
      storyRole: String(blueprintPage.story_role || imagePage.story_role || ""),
      text,
      image,
      alt: `${copy.sceneAlt} ${sceneNumber} — ${title}`,
      progressLabel: `${copy.scene} ${index + 1} ${copy.of} ${orderedSpreads.length}`,
    });
  });

  const closing = draftPages.find((page) => pageType(page) === "closing_text");
  if (!String(closing?.text || "").trim()) issues.push("Closing text is missing");
  else sections.push({
    id: "closing",
    kind: "text_only",
    text: String(closing.text).trim(),
    progressLabel: copy.closing,
  });

  if (issues.length) throw new InteractiveBookUnavailableError(issues);
  return {
    schemaVersion: 1,
    id: String(project.id),
    title,
    language,
    fontStyle: String(blueprint.typography?.id || project.productConfiguration?.font_style || "school_round"),
    pageCount: Number(blueprint.format?.interior_pages || draftPages.length),
    narrativeSceneCount: orderedSpreads.length,
    scenes: sections,
  };
}

export function attachNarrationToManifest(book, narrationRecord, audioUrlForFilename) {
  if (!book || narrationRecord?.fulfillmentStatus !== "ready" || !Array.isArray(narrationRecord?.deliveryManifest?.scenes)) return book;
  const bySceneId = new Map(narrationRecord.deliveryManifest.scenes.map((scene) => [String(scene.sceneId || ""), scene]));
  return {
    ...book,
    narration: {
      synthetic: true,
      voiceId: String(narrationRecord.configuration?.voiceId || ""),
      styleId: String(narrationRecord.configuration?.styleId || ""),
    },
    scenes: book.scenes.map((scene) => {
      const narration = bySceneId.get(String(scene.id || ""));
      if (!narration?.filename) return scene;
      return { ...scene, audio: audioUrlForFilename(String(narration.filename)) };
    }),
  };
}
