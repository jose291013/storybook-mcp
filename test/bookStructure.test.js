import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { BOOK_QUESTIONS, MAX_REFERENCE_PHOTOS } from "../src/config/questionnaire.js";
import { applyPagePlan, createPagePlan } from "../src/config/bookStructure.js";
import { normalizeBookRequest } from "../src/services/normalizeBookRequest.js";
import { composeBookPagePNG } from "../src/services/composeBookPagePNG.js";
import { ILLUSTRATION_STYLES } from "../src/config/illustrationStyles.js";
import { getWordsTargetByAge } from "../src/agents/textWriter.js";
import { buildFinalPrompt } from "../src/services/imageRunner.js";
import { buildSceneContinuity } from "../src/services/visualContinuity.js";
import { lockBlueprintContinuity } from "../src/agents/blueprintFiller.js";
import { buildNarrativeContext } from "../src/services/buildNarrativeContext.js";
import { ALLOWED_PAGE_COUNTS, calculateBookPrice, PAGE_PRICE_EUR, TYPOGRAPHY_OPTIONS, UNIVERSE_OPTIONS } from "../src/config/bookOptions.js";
import { IMPROVABLE_QUESTION_IDS } from "../src/routes/improveAnswer.js";

test("questionnaire contains ten simple questions", () => {
  assert.equal(BOOK_QUESTIONS.length, 10);
  assert.equal(new Set(BOOK_QUESTIONS.map((question) => question.id)).size, 10);
  assert.deepEqual(BOOK_QUESTIONS.map((question) => question.id), [
    "hero_name",
    "age",
    "favorite_activities",
    "personality",
    "dream",
    "challenge",
    "message",
    "signature_object",
    "important_people",
    "universe",
  ]);
});

test("illustration catalog exposes six distinct print-ready directions", () => {
  assert.equal(ILLUSTRATION_STYLES.length, 6);
  assert.equal(new Set(ILLUSTRATION_STYLES.map((style) => style.id)).size, 6);
  assert.ok(ILLUSTRATION_STYLES.every((style) => style.prompt && style.palette.length === 3));
});

test("story pages use richer word targets while opening and closing stay concise", () => {
  assert.deepEqual(getWordsTargetByAge("6", "text"), { target: 70, tolerance: 11 });
  assert.deepEqual(getWordsTargetByAge("6", "opening_text"), { target: 41, tolerance: 8 });
});

test("six distinct book fonts are bundled with their licenses", async () => {
  const files = [
    "assets/fonts/Andika-Regular.ttf",
    "assets/fonts/PatrickHand-Regular.ttf",
    "assets/fonts/Fredoka-Variable.ttf",
    "assets/fonts/ComicNeue-Regular.ttf",
    "assets/fonts/Baloo2-Variable.ttf",
    "assets/fonts/Borel-Regular.ttf",
    "assets/fonts/Andika-OFL.txt",
    "assets/fonts/PatrickHand-OFL.txt",
    "assets/fonts/Fredoka-OFL.txt",
    "assets/fonts/ComicNeue-OFL.txt",
    "assets/fonts/Baloo2-OFL.txt",
    "assets/fonts/Borel-OFL.txt",
  ];
  for (const file of files) assert.ok((await fs.stat(file)).size > 1000);
});

test("page plan contains 24 square-album interior pages and 11 paired spreads", () => {
  const pages = createPagePlan();
  assert.equal(pages.length, 24);
  assert.equal(pages[0].page_type, "opening_text");
  assert.equal(pages[23].page_type, "closing_text");

  for (let spread = 1; spread <= 11; spread += 1) {
    const spreadPages = pages.filter((page) => page.spread_number === spread);
    assert.equal(spreadPages.length, 2);
    assert.deepEqual(new Set(spreadPages.map((page) => page.page_type)), new Set(["text", "image"]));
  }
});

test("page-plan normalization removes prompts from the wrong page type", () => {
  const source = {
    pages: createPagePlan().map((page) => ({
      ...page,
      text_prompt: `text ${page.page_number}`,
      image_prompt: `image ${page.page_number}`,
    })),
  };
  const result = applyPagePlan(source);
  for (const page of result.pages) {
    if (page.page_type === "image") assert.equal(page.text_prompt, "");
    else assert.equal(page.image_prompt, "");
  }
});

test("new request format accepts up to five typed photo references", () => {
  const photos = Array.from({ length: MAX_REFERENCE_PHOTOS }, (_, index) => ({
    id: `photo-${index}.png`,
    role: index === 0 ? "child" : "friend",
    story_role: index === 1 ? "guide" : undefined,
    name: index === 0 ? "Lina" : `Ami ${index}`,
  }));
  const normalized = normalizeBookRequest({
    questionnaire: { hero_name: "Lina", age: 6, language: "fr" },
    photos,
  });
  assert.equal(normalized.answers.language, "FR");
  assert.equal(normalized.photos.length, 5);
  assert.equal(normalized.photos[0].story_role, "hero");
  assert.equal(normalized.photos[1].story_role, "guide");
});

test("request rejects a sixth photo", () => {
  const photos = Array.from({ length: 6 }, (_, index) => ({
    id: `photo-${index}.png`,
    role: index === 0 ? "child" : "friend",
  }));
  assert.throws(
    () => normalizeBookRequest({ questionnaire: { hero_name: "Lina", age: 6 }, photos }),
    /maximum of 5/
  );
});

test("every sellable page count creates complete alternating spreads", () => {
  for (const pageCount of ALLOWED_PAGE_COUNTS) {
    const pages = createPagePlan(pageCount);
    const spreadCount = (pageCount - 2) / 2;
    assert.equal(pages.length, pageCount);
    assert.equal(pages.at(-1).page_number, pageCount);
    assert.equal(pages.at(-1).page_type, "closing_text");
    assert.equal(pages.filter((page) => page.page_type === "image").length, spreadCount);
    for (let spread = 1; spread <= spreadCount; spread += 1) {
      assert.deepEqual(
        new Set(pages.filter((page) => page.spread_number === spread).map((page) => page.page_type)),
        new Set(["text", "image"])
      );
    }
  }
});

test("the product configurator exposes visual universes and previewable typography", () => {
  assert.equal(UNIVERSE_OPTIONS.length, 6);
  assert.ok(UNIVERSE_OPTIONS.every((option) => option.prompt && option.palette.length === 3 && option.previewImage));
  assert.equal(TYPOGRAPHY_OPTIONS.length, 6);
  assert.ok(TYPOGRAPHY_OPTIONS.every((option) => option.preview));
  assert.ok(ILLUSTRATION_STYLES.every((style) => style.previewImage));
});

test("page prices use the configured 1.2458 euro unit price", () => {
  assert.equal(PAGE_PRICE_EUR, 1.2458);
  assert.equal(calculateBookPrice(24), 29.9);
  assert.equal(calculateBookPrice(28), 34.88);
  assert.equal(calculateBookPrice(32), 39.87);
  assert.equal(calculateBookPrice(36), 44.85);
  assert.equal(calculateBookPrice(40), 49.83);
  assert.equal(calculateBookPrice(44), 54.82);
});

test("only narrative questionnaire answers can be improved with AI", () => {
  assert.ok(IMPROVABLE_QUESTION_IDS.has("dream"));
  assert.ok(IMPROVABLE_QUESTION_IDS.has("message"));
  assert.equal(IMPROVABLE_QUESTION_IDS.has("hero_name"), false);
  assert.equal(IMPROVABLE_QUESTION_IDS.has("age"), false);
});

test("selected book language wins over the language used in questionnaire answers", () => {
  const normalized = normalizeBookRequest({
    questionnaire: {
      hero_name: "Noa",
      age: 6,
      favorite_activities: "Observer les étoiles",
      language: "es",
    },
  });
  assert.equal(normalized.answers.language, "ES");
});

test("product choices are normalized independently from the book language", () => {
  const normalized = normalizeBookRequest({
    questionnaire: {
      hero_name: "Noa",
      age: 6,
      language: "ES",
      page_count: 40,
      font_style: "handwritten_story",
      universe_id: "coral_ocean",
      universe_details: "un petit phare rouge",
    },
  });
  assert.equal(normalized.answers.page_count, 40);
  assert.equal(normalized.answers.font_style, "handwritten_story");
  assert.equal(normalized.answers.universe_id, "coral_ocean");
  assert.match(normalized.answers.universe_instructions, /phare rouge/);
  assert.equal(normalized.answers.language, "ES");
});

test("scene continuity locks child outfit and mascot species while attaching the real child photo", () => {
  const blueprint = {
    hero: { name: "Noa", outfit_lock: "blue sweater, ochre trousers, white sneakers" },
    cast: [{ name: "Pixel", role: "mascot", canon_short: "small red fox with a white muzzle and green scarf" }],
  };
  const continuity = buildSceneContinuity({
    blueprint,
    characterCanons: [{
      name: "Noa",
      role: "child",
      photoId: "noa.jpg",
      character_fingerprint: "round face, brown eyes and short dark curls",
    }],
    castPresent: ["Noa", "Pixel"],
    scenePrompt: "Noa and Pixel cross the moonlit forest",
  });
  assert.equal(continuity.referenceImages.length, 1);
  assert.match(continuity.referenceImages[0].path, /noa\.jpg$/);
  assert.match(continuity.characterFingerprints.join(" "), /FIXED OUTFIT.*blue sweater/i);
  assert.match(continuity.characterFingerprints.join(" "), /red fox.*SPECIES LOCK/i);

  const prompt = buildFinalPrompt({
    prompt: "A new forest scene",
    characterFingerprints: continuity.characterFingerprints,
    referenceImages: continuity.referenceImages,
    sceneContract: continuity.sceneContract,
  });
  assert.match(prompt, /never change face, species.*outfit/i);
  assert.match(prompt, /primary identity reference/i);
  assert.match(prompt, /MANDATORY VISIBLE CAST \(2\): Noa, Pixel/);
  assert.match(prompt, /Do not omit, merge, replace or transform/i);
});

test("lost quest objects stay invisible until the paired discovery scene", () => {
  const blueprint = {
    language: "FR",
    hero: { name: "Noa", outfit_lock: "blue sweater" },
    cast: [{ name: "Luma", role: "other", story_role: "companion", canon_short: "a small golden star" }],
    plot_continuity: {
      quest_object: {
        name: "Luma, l'etoile perdue",
        appearance_lock: "a small five-point golden star with a warm glow",
        discovery_scene_number: 9,
      },
    },
    cover: { title: "Noa et Luma", image_prompt: "Noa et Luma", cast_present: ["Noa", "Luma"] },
    pages: createPagePlan().map((page) => ({
      ...page,
      text_prompt: page.page_type === "image" ? "" : "continue l'histoire",
      image_prompt: page.page_type === "image" ? "Noa cherche Luma" : "",
      cast_present: page.page_type === "image" ? ["Noa", "Luma"] : [],
    })),
  };

  const result = lockBlueprintContinuity(blueprint, { language: "FR" });
  const before = result.pages.find((page) => page.page_type === "image" && page.scene_number === 8);
  const discovery = result.pages.find((page) => page.page_type === "image" && page.scene_number === 9);
  const after = result.pages.find((page) => page.page_type === "image" && page.scene_number === 10);

  assert.equal(before.visual_state.quest_object_state, "hidden");
  assert.equal(before.cast_present.includes("Luma"), false);
  assert.match(before.image_prompt, /Ne pas montrer Luma/);
  assert.equal(discovery.visual_state.quest_object_state, "discovered");
  assert.equal(discovery.cast_present.includes("Luma"), true);
  assert.match(discovery.image_prompt, /pour la premiere fois/);
  assert.equal(after.visual_state.quest_object_state, "after_discovery");
});

test("narrative context pairs prose with its exact illustration cast and object state", () => {
  const pages = createPagePlan().map((page) => ({
    ...page,
    text_prompt: page.page_type === "image" ? "" : "Pixel et Noa avancent ensemble",
    image_prompt: page.page_type === "image" ? "Pixel et Noa dans la foret" : "",
    cast_present: page.page_type === "image" ? ["Noa", "Pixel"] : [],
    visual_state: page.page_type === "image" ? { quest_object_state: "hidden" } : {},
  }));
  const context = buildNarrativeContext({
    blueprint: { cover: {}, world: {}, cast: [], pages, plot_continuity: { quest_object: { name: "Luma" } } },
    intake: {},
    storybrand: {},
  });
  const firstSpreadText = context.outline.find((page) => page.scene_number === 1);
  assert.deepEqual(firstSpreadText.paired_image.cast_present, ["Noa", "Pixel"]);
  assert.equal(firstSpreadText.paired_image.visual_state.quest_object_state, "hidden");
  assert.equal(context.plot_continuity.quest_object.name, "Luma");
});

test("blueprint normalization gives every book one canonical outfit and canonical cast names", () => {
  const blueprint = {
    hero: { name: "Noa", outfit_lock: "" },
    cast: [{ name: "Pixel", role: "mascot", canon_short: "red fox" }],
    cover: { image_prompt: "Noa et Pixel sous les étoiles", cast_present: ["Noa l'enfant", "Pixel le renard"] },
    pages: createPagePlan().map((page) => ({
      ...page,
      text_prompt: page.page_type === "image" ? "" : "text",
      image_prompt: page.page_type === "image" ? "Noa avec Pixel" : "",
      cast_present: page.page_type === "image" ? ["Noa l'enfant", "Pixel le renard"] : [],
    })),
  };
  const result = lockBlueprintContinuity(blueprint, {
    heroProfile: { outfit_lock: "green jacket, navy trousers, red boots" },
    language: "ES",
    characterCanons: [{
      name: "Abuela Rosa",
      role: "family",
      story_role: "guide",
      relationship: "abuela",
      photoId: "abuela.jpg",
      canon_short: "older woman with silver curls, round glasses and a burgundy cardigan",
    }],
  });
  assert.equal(result.language, "ES");
  assert.equal(result.hero.outfit_lock, "green jacket, navy trousers, red boots");
  assert.deepEqual(result.cover.cast_present, ["Noa", "Pixel"]);
  assert.ok(result.pages.filter((page) => page.page_type === "image").every(
    (page) => page.cast_present.join(",") === "Noa,Pixel"
  ) === false);
  const guidePage = result.pages.find((page) => page.page_type === "image" && page.story_role === "meeting_the_guide");
  assert.ok(guidePage.cast_present.includes("Abuela Rosa"));
  assert.match(guidePage.image_prompt, /Incluye claramente a Abuela Rosa/);
  assert.equal(result.cast.find((character) => character.name === "Abuela Rosa").story_role, "guide");
});

test("text pages render as a square 21 cm preview", async () => {
  const outputsDir = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-page-"));
  try {
    await composeBookPagePNG({
      baseUrl: "http://localhost:3000",
      body: "Lina lève les yeux vers les étoiles et prend une grande inspiration.",
      outName: "page-1",
      pageType: "opening_text",
      pageNumber: 1,
      dpi: 150,
      outputsDir,
    });
    const metadata = await sharp(path.join(outputsDir, "page-1.png")).metadata();
    assert.equal(metadata.width, metadata.height);
    assert.equal(metadata.width, 1240);
  } finally {
    await fs.rm(outputsDir, { recursive: true, force: true });
  }
});

test("all six typography selections render distinct text pages", async () => {
  const outputsDir = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-font-"));
  try {
    const common = {
      baseUrl: "http://localhost:3000",
      body: "Une aventure douce commence ici.",
      pageType: "text",
      pageNumber: 8,
      dpi: 72,
      outputsDir,
    };
    const rendered = [];
    for (const option of TYPOGRAPHY_OPTIONS) {
      await composeBookPagePNG({ ...common, outName: option.id, fontStyle: option.id });
      rendered.push(await fs.readFile(path.join(outputsDir, `${option.id}.png`)));
    }
    assert.equal(new Set(rendered.map((buffer) => buffer.toString("base64"))).size, TYPOGRAPHY_OPTIONS.length);
  } finally {
    await fs.rm(outputsDir, { recursive: true, force: true });
  }
});

test("rendered text pages do not embed a second large page number", async () => {
  const source = await fs.readFile("src/services/composeBookPagePNG.js", "utf8");
  assert.doesNotMatch(source, /text:\s*String\(pageNumber\)/);
});

test("the closing moral is explicitly addressed to the child hero", async () => {
  const [blueprintPrompt, textPrompt, qaPrompt] = await Promise.all([
    fs.readFile("src/prompts/blueprint_filler.txt", "utf8"),
    fs.readFile("src/prompts/text_writer.txt", "utf8"),
    fs.readFile("src/prompts/qa.txt", "utf8"),
  ]);
  assert.match(blueprintPrompt, /addressed directly to the child hero/i);
  assert.match(textPrompt, /using second person/i);
  assert.match(qaPrompt, /addresses the child hero directly in second person/i);
});
