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

test("questionnaire contains ten simple questions", () => {
  assert.equal(BOOK_QUESTIONS.length, 10);
  assert.equal(new Set(BOOK_QUESTIONS.map((question) => question.id)).size, 10);
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

test("pedagogical and handwritten fonts are bundled with their licenses", async () => {
  const files = [
    "assets/fonts/Andika-Regular.ttf",
    "assets/fonts/PatrickHand-Regular.ttf",
    "assets/fonts/Andika-OFL.txt",
    "assets/fonts/PatrickHand-OFL.txt",
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
    name: index === 0 ? "Lina" : `Ami ${index}`,
  }));
  const normalized = normalizeBookRequest({
    questionnaire: { hero_name: "Lina", age: 6, language: "fr" },
    photos,
  });
  assert.equal(normalized.answers.language, "FR");
  assert.equal(normalized.photos.length, 5);
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
