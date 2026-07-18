import assert from "node:assert/strict";
import test from "node:test";
import { createPagePlan } from "../src/config/bookStructure.js";
import { buildInteractiveBookManifest, InteractiveBookUnavailableError } from "../src/services/interactiveBookManifest.js";

function completeProject(pageCount = 24) {
  const id = "11111111-1111-4111-8111-111111111111";
  const pages = createPagePlan(pageCount);
  return {
    id,
    title: "Noa",
    locale: "FR",
    productConfiguration: { font_style: "school_round" },
    finalBlueprint: {
      language: "ES",
      format: { interior_pages: pageCount },
      typography: { id: "handwritten_story" },
      cover: { title: "Noa y la luz dorada" },
      pages,
    },
    previewResult: {
      coverPreviewUrl: `/api/projects/${id}/preview-assets/cover.png`,
      coverStorageKey: `ebooks/previews/${id}/cover.png`,
      draftPages: pages.map((page) => ({
        ...page,
        text: page.page_type.includes("text") ? `Texto definitivo de la página ${page.page_number}` : "",
        imageUrl: page.page_type === "image" ? `/api/projects/${id}/preview-assets/image-${page.page_number}.png` : "",
        imageStorageKey: page.page_type === "image" ? `ebooks/previews/${id}/image-${page.page_number}.png` : "",
      })),
    },
  };
}

test("a completed 24-page project becomes a private full interactive book", () => {
  const book = buildInteractiveBookManifest(completeProject());
  assert.equal(book.title, "Noa y la luz dorada");
  assert.equal(book.language, "es-ES");
  assert.equal(book.fontStyle, "handwritten_story");
  assert.equal(book.narrativeSceneCount, 11);
  assert.equal(book.scenes.length, 14);
  assert.deepEqual(book.scenes.map(({ kind }) => kind), ["cover", "text_only", ...Array(11).fill("scene"), "text_only"]);
  assert.equal(book.scenes[2].text, "Texto definitivo de la página 2");
  assert.match(book.scenes[2].image, /^\/api\/projects\/11111111-1111-4111-8111-111111111111\/preview-assets\//);
  assert.ok(book.scenes.filter(({ image }) => image).every(({ image }) => image.startsWith("/api/projects/")));
  assert.equal(JSON.stringify(book).includes("image_prompt"), false);
});

test("the interactive manifest rejects an incomplete spread instead of showing a broken book", () => {
  const project = completeProject();
  project.previewResult.draftPages = project.previewResult.draftPages.filter((page) => page.page_number !== 3);
  assert.throws(() => buildInteractiveBookManifest(project), InteractiveBookUnavailableError);
});

test("every sellable page count produces all of its interactive narrative scenes", () => {
  for (const pageCount of [24, 28, 32, 36, 40, 44]) {
    const book = buildInteractiveBookManifest(completeProject(pageCount));
    const expectedNarrativeScenes = (pageCount - 2) / 2;
    assert.equal(book.narrativeSceneCount, expectedNarrativeScenes);
    assert.equal(book.scenes.length, expectedNarrativeScenes + 3);
  }
});
