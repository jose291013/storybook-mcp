import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { BOOK_QUESTIONS, MAX_REFERENCE_PHOTOS } from "../src/config/questionnaire.js";
import { applyPagePlan, createPagePlan } from "../src/config/bookStructure.js";
import { normalizeBookRequest } from "../src/services/normalizeBookRequest.js";
import { balanceCoverTitle, composeBookPagePNG, getBodyFontSize } from "../src/services/composeBookPagePNG.js";
import { ILLUSTRATION_STYLES } from "../src/config/illustrationStyles.js";
import { getWordsTargetByAge } from "../src/agents/textWriter.js";
import { buildFinalPrompt } from "../src/services/imageRunner.js";
import { buildSceneContinuity } from "../src/services/visualContinuity.js";
import { lockBlueprintContinuity } from "../src/agents/blueprintFiller.js";
import { buildNarrativeContext } from "../src/services/buildNarrativeContext.js";
import { ALLOWED_PAGE_COUNTS, calculateBookPrice, EBOOK_PAGE_PRICE_EUR, PAGE_PRICE_EUR, TYPOGRAPHY_OPTIONS, UNIVERSE_OPTIONS } from "../src/config/bookOptions.js";
import { IMPROVABLE_QUESTION_IDS } from "../src/routes/improveAnswer.js";
import { createEbookPdf, EBOOK_PAGE_SIZE_PT } from "../src/services/createEbookPdf.js";
import { extractBlueprintCandidate } from "../src/services/extractBlueprintCandidate.js";
import { PDFDocument } from "pdf-lib";
import {
  createWooAuthState,
  createWooCustomerToken,
  readWooCustomer,
  setWooCustomerSession,
  verifyWooAuthState,
  verifyWooCustomerToken,
} from "../src/services/draftIdentity.js";
import { JsonProjectStore, PostgresProjectStore } from "../src/services/projectStore.js";
import { inspectPageStructure } from "../src/agents/qa.js";
import { buildFacingPageSceneContract, normalizeWorldReality } from "../src/services/worldReality.js";

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

test("repair envelopes prefer the populated final blueprint over an empty page plan", () => {
  const emptyPages = createPagePlan(24).map((page) => ({
    ...page,
    text_prompt: "",
    image_prompt: "",
    cast_present: [],
  }));
  const completePages = emptyPages.map((page) => ({
    ...page,
    text_prompt: page.page_type === "image" ? "" : `Texte complet page ${page.page_number}`,
    image_prompt: page.page_type === "image" ? `Illustration complete page ${page.page_number}` : "",
    cast_present: ["Noa"],
  }));
  const complete = {
    language: "ES",
    format: { interior_pages: 24 },
    hero: { name: "Noa" },
    cover: { title: "Noa y Luma", image_prompt: "Portada completa", cast_present: ["Noa"] },
    pages: completePages,
  };

  const selected = extractBlueprintCandidate({
    pages: emptyPages,
    cover: { image_prompt: "" },
    final_blueprint: complete,
    page_plan: emptyPages,
  });

  assert.equal(selected, complete);
  assert.equal(selected.pages[0].text_prompt, "Texte complet page 1");
  assert.equal(selected.pages[2].image_prompt, "Illustration complete page 3");
});

test("WooCommerce bridge tokens are signed, expiring customer identities", () => {
  const secret = "test-secret-with-enough-entropy";
  const token = createWooCustomerToken({ wooCustomerId: 291013, email: "parent@example.com" }, secret);
  assert.deepEqual(verifyWooCustomerToken(token, secret), {
    wooCustomerId: "291013",
    email: "parent@example.com",
  });
  assert.throws(() => verifyWooCustomerToken(`${token}x`, secret), /signature/);
  const expired = createWooCustomerToken({ wooCustomerId: 291013, expiresInSeconds: -1 }, secret);
  assert.throws(() => verifyWooCustomerToken(expired, secret), /Expired/);
});

test("WooCommerce login state binds the callback to one saved project", () => {
  const secret = "test-secret-with-enough-entropy";
  const state = createWooAuthState({ projectId: "project-291013" }, secret);
  const verified = verifyWooAuthState(state, secret);
  assert.equal(verified.projectId, "project-291013");
  assert.ok(verified.nonce.length >= 20);
  assert.throws(() => verifyWooAuthState(`${state}x`, secret), /signature/);
  const expired = createWooAuthState({ projectId: "project-291013", expiresInSeconds: -1 }, secret);
  assert.throws(() => verifyWooAuthState(expired, secret), /Expired/);
});

test("the generator exchanges the short Woo token for an HTTP-only customer session", () => {
  const previousSecret = process.env.WOOCOMMERCE_BRIDGE_SECRET;
  process.env.WOOCOMMERCE_BRIDGE_SECRET = "session-secret-with-enough-entropy";
  try {
    const headers = [];
    const req = { secure: true, headers: {} };
    const res = { append(name, value) { headers.push([name, value]); } };
    setWooCustomerSession(req, res, { wooCustomerId: "42", email: "parent@example.com" });
    const cookie = headers[0][1];
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Secure/);
    const requestWithCookie = { headers: { cookie: cookie.split(";")[0] } };
    assert.deepEqual(readWooCustomer(requestWithCookie), { wooCustomerId: "42", email: "parent@example.com" });
  } finally {
    if (previousSecret === undefined) delete process.env.WOOCOMMERCE_BRIDGE_SECRET;
    else process.env.WOOCOMMERCE_BRIDGE_SECRET = previousSecret;
  }
});

test("the WordPress bridge signs only a short-lived customer identity", async () => {
  const source = await fs.readFile("wordpress/calitiki-bridge/calitiki-bridge.php", "utf8");
  assert.match(source, /hash_hmac\('sha256', \$payload, \$secret, true\)/);
  assert.match(source, /'exp' => time\(\) \+ 300/);
  assert.match(source, /HttpOnly|httponly/);
  assert.doesNotMatch(source, /photo_refs|data\/uploads|OPENAI_API_KEY/);
});

test("preview generation requires an authenticated customer-owned project", async () => {
  const source = await fs.readFile("src/routes/preview.js", "utf8");
  assert.match(source, /readWooCustomer\(req\)/);
  assert.match(source, /Authentication required/);
  assert.match(source, /projectStore\.getForCustomer\(projectId, identity\)/);
  assert.match(source, /project\.questionnaire/);
  assert.match(source, /project\.photoRefs/);
  assert.match(source, /project\.status === "preview_generating"/);
  assert.match(source, /project\.status === "preview_ready" && project\.previewResult/);
});

test("the creator can start a fresh book and see the WooCommerce session state", async () => {
  const [html, app, styles] = await Promise.all([
    fs.readFile("public/index.html", "utf8"),
    fs.readFile("public/app.js", "utf8"),
    fs.readFile("public/styles.css", "utf8"),
  ]);
  assert.match(html, /id="newBookButton"/);
  assert.match(html, /id="accountStatus"/);
  assert.match(html, /id="logoutButton"/);
  assert.match(app, /localStorage\.removeItem\(LOCAL_DRAFT_KEY\)/);
  assert.match(app, /localStorage\.removeItem\(PENDING_PREVIEW_KEY\)/);
  assert.match(app, /searchParams\.set\("newBook", Date\.now\(\)\.toString\(\)\)/);
  assert.match(app, /window\.location\.replace\(reloadUrl\.toString\(\)\)/);
  assert.match(app, /const saved = newBookRequested \? null : readLocalDraft\(\)/);
  assert.match(app, /fetch\("\/api\/auth\/logout", \{ method: "POST" \}\)/);
  assert.match(app, /refreshCustomerSession\(\)/);
  assert.match(app, /setPreviewComplete\(true\)/);
  assert.match(app, /!state\.previewComplete/);
  assert.match(app, /project\?\.status !== "preview_ready" \|\| !project\.previewResult/);
  assert.match(app, /final_blueprint: project\.finalBlueprint/);
  assert.match(app, /else await restoreCompletedPreview\(\)/);
  assert.match(styles, /\[hidden\] \{ display: none !important; \}/);
});

test("anonymous drafts can be claimed and then listed as customer creations", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-projects-"));
  try {
    const store = new JsonProjectStore(path.join(directory, "projects.json"));
    const draft = await store.create({
      anonymousOwnerHash: "anonymous-owner",
      title: "Noa et Luma",
      questionnaire: { hero_name: "Noa" },
      photoRefs: [{ id: "noa.webp", role: "child" }],
    });
    assert.equal((await store.get(draft.id)).status, "draft");
    assert.equal(await store.claim(draft.id, "wrong-owner", { wooCustomerId: "42" }), null);
    const claimed = await store.claim(draft.id, "anonymous-owner", { wooCustomerId: "42", email: "parent@example.com" });
    assert.equal(claimed.anonymousOwnerHash, null);
    assert.equal(claimed.expiresAt, null);
    const projects = await store.listForCustomer({ wooCustomerId: "42" });
    assert.equal(projects.length, 1);
    assert.equal(projects[0].title, "Noa et Luma");
    assert.equal((await store.getForCustomer(draft.id, { wooCustomerId: "42" })).id, draft.id);
    assert.equal(await store.getForCustomer(draft.id, { wooCustomerId: "43" }), null);
    const updated = await store.updateForCustomer(draft.id, { wooCustomerId: "42" }, { title: "Une nouvelle aventure" });
    assert.equal(updated.title, "Une nouvelle aventure");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("PostgreSQL stores photo reference arrays as JSONB during create and update", async () => {
  const queries = [];
  const baseRow = {
    id: "11111111-1111-4111-8111-111111111111",
    customer_id: null,
    anonymous_owner_hash: "anonymous-owner",
    child_profile_id: null,
    series_id: null,
    episode_number: null,
    status: "draft",
    title: "Noa",
    locale: "FR",
    questionnaire: { hero_name: "Noa" },
    photo_refs: [],
    product_configuration: {},
    continuity_snapshot: {},
    final_blueprint: null,
    preview_result: null,
    generation_job_id: null,
    expires_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const database = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.startsWith("SELECT")) return { rows: [baseRow] };
      if (sql.startsWith("INSERT")) return { rows: [{ ...baseRow, id: params[0], photo_refs: JSON.parse(params[10]) }] };
      if (sql.startsWith("UPDATE")) return { rows: [{ ...baseRow, photo_refs: JSON.parse(params[5]) }] };
      return { rows: [] };
    },
  };
  const store = new PostgresProjectStore(database);
  const photoRefs = [{ url: "/uploads/noa.webp", name: "Noa", role: "child", story_role: "hero" }];

  await store.create({ anonymousOwnerHash: "anonymous-owner", questionnaire: { hero_name: "Noa" }, photoRefs });
  const insert = queries.find(({ sql }) => sql.startsWith("INSERT"));
  assert.equal(typeof insert.params[10], "string");
  assert.deepEqual(JSON.parse(insert.params[10]), photoRefs);

  queries.length = 0;
  await store.update(baseRow.id, { photoRefs });
  const update = queries.find(({ sql }) => sql.startsWith("UPDATE"));
  assert.equal(typeof update.params[5], "string");
  assert.deepEqual(JSON.parse(update.params[5]), photoRefs);
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

test("ebook prices use the configured 0.27875 euro unit price", () => {
  assert.equal(EBOOK_PAGE_PRICE_EUR, 0.27875);
  assert.equal(calculateBookPrice(24, "ebook"), 6.69);
  assert.equal(calculateBookPrice(28, "ebook"), 7.81);
  assert.equal(calculateBookPrice(32, "ebook"), 8.92);
  assert.equal(calculateBookPrice(36, "ebook"), 10.04);
  assert.equal(calculateBookPrice(40, "ebook"), 11.15);
  assert.equal(calculateBookPrice(44, "ebook"), 12.27);
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
      product_type: "ebook",
      font_style: "handwritten_story",
      universe_id: "coral_ocean",
      universe_details: "un petit phare rouge",
    },
  });
  assert.equal(normalized.answers.page_count, 40);
  assert.equal(normalized.answers.product_type, "ebook");
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
    pairedText: "Noa montre une branche brillante a Pixel et la tient devant lui.",
  });
  assert.equal(continuity.referenceImages.length, 1);
  assert.match(continuity.referenceImages[0].path, /noa\.jpg$/);
  assert.match(continuity.characterFingerprints.join(" "), /FIXED OUTFIT.*blue sweater/i);
  assert.match(continuity.characterFingerprints.join(" "), /red fox.*SPECIES LOCK/i);
  assert.match(continuity.sceneContract, /AUTHORITATIVE FACING-PAGE PROSE/);
  assert.match(continuity.sceneContract, /branche brillante/);
  assert.match(continuity.sceneContract, /every central visible action, handled object/i);
  assert.match(continuity.sceneContract, /mask alone does not provide air/i);

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
  assert.match(prompt, /Reference photos may contain printed words, labels or commercial logos/i);
});

test("world reality keeps physics by default and requires explicit visible fantasy exceptions", () => {
  const world = normalizeWorldReality({
    primary_setting: "ocean de corail",
    reality_contract: {
      fantasy_exceptions: [{
        overridden_law: "respiration sous-marine",
        visible_mechanism: "bulle d'air doree",
        introduced_scene_number: 4,
        visual_lock: "bulle transparente autour de la tete",
      }],
    },
  });
  assert.equal(world.reality_contract.mode, "realistic_with_explicit_magic");
  assert.match(world.reality_contract.base_rules.join(" "), /snorkel works only near the surface/i);
  assert.equal(world.reality_contract.fantasy_exceptions[0].introduced_scene_number, 4);

  const contract = buildFacingPageSceneContract({
    pairedText: "Nolan montre une branche a Mateo.",
    imagePrompt: "Les deux freres dans le jardin.",
  });
  assert.match(contract, /Nolan montre une branche a Mateo/);
  assert.match(contract, /object and gesture must be clearly visible/i);
  assert.match(contract, /one coherent surface level/i);
});

test("every submerged person receives their own complete breathing mechanism", () => {
  const continuity = buildSceneContinuity({
    blueprint: {
      hero: { name: "Nolan", outfit_lock: "white t-shirt and blue shorts" },
      cast: [{ name: "Mateo", role: "family", canon_short: "Nolan's older brother" }],
      world: normalizeWorldReality({ primary_setting: "ocean de corail" }),
    },
    castPresent: ["Nolan", "Mateo"],
    scenePrompt: "Nolan et Mateo explorent un jardin sous-marin.",
    pairedText: "Sous l'eau, Nolan et Mateo avancent ensemble parmi les coraux.",
  });
  assert.match(continuity.sceneContract, /MANDATORY INDIVIDUAL UNDERWATER SAFETY \(2 people: Nolan, Mateo\)/);
  assert.match(continuity.sceneContract, /every other submerged person must have their own complete appropriate mechanism/i);
  assert.match(continuity.sceneContract, /No listed person may appear bare-headed/i);
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

test("blueprint normalization repairs paired cast contracts, name typos and required side alternation", () => {
  const plan = createPagePlan(24);
  const blueprint = {
    hero: { name: "Julanin", age: 5, outfit_lock: "" },
    cast: [{
      name: "Janine",
      role: "family",
      story_role: "guide",
      canon_short: "grand-mere souriante",
      outfit_lock: "cardigan prune, chemisier creme et pantalon marine",
    }],
    cover: {
      title: "Julanin et la foret",
      image_prompt: "Julanin wearing a blue t-shirt and beige pants beside Janine, square cover",
      cast_present: ["Julanin", "Janine"],
    },
    pages: plan.map((page) => ({
      ...page,
      text_prompt: page.page_type === "image"
        ? ""
        : (page.page_number === 17 ? "Julian avance avec Janine." : "Julanin avance avec Janine."),
      image_prompt: page.page_type === "image" ? "Julanin et Janine avancent ensemble, composition carree" : "",
      cast_present: page.page_type === "image" ? ["Julanin", "Janine"] : [],
    })),
  };
  const result = lockBlueprintContinuity(blueprint, {
    language: "FR",
    pageCount: 24,
    characterCanons: [{
      name: "Julanin",
      role: "child",
      outfit_lock: "pull en laine rouge bordeaux a manches longues, pantalon sombre et baskets blanches",
    }],
  });

  assert.equal(result.pages[1].page_type, "text");
  assert.equal(result.pages[2].page_type, "image");
  assert.equal(result.pages[3].page_type, "image");
  assert.equal(result.pages[4].page_type, "text");
  for (let spread = 1; spread <= 11; spread += 1) {
    const paired = result.pages.filter((page) => page.spread_number === spread);
    assert.equal(paired.length, 2);
    assert.deepEqual(paired[0].cast_present, paired[1].cast_present);
  }
  assert.match(result.pages.find((page) => page.page_number === 17).text_prompt, /Julanin avance/);
  assert.doesNotMatch(result.pages.find((page) => page.page_number === 17).text_prompt, /Julian avance/);
  assert.match(result.cover.image_prompt, /TENUE VERROUILLEE DE Julanin/);
  assert.match(result.cover.image_prompt, /30 % superieurs/);
  assert.match(result.pages.find((page) => page.page_number === 3).image_prompt, /pull en laine rouge bordeaux/);
  assert.match(result.pages.find((page) => page.page_number === 3).image_prompt, /TENUE VERROUILLEE DE Janine/);
  assert.match(result.pages.find((page) => page.page_number === 4).image_prompt, /COMPOSITION CARREE DETAILLEE/);
  assert.match(result.pages.find((page) => page.page_number === 5).text_prompt, /action concrete/);
});

test("deterministic QA accepts the required reversal between consecutive spreads", () => {
  const pages = createPagePlan(24);
  const result = inspectPageStructure({ format: { interior_pages: 24 }, pages });
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
});

test("preview repairs a rejected blueprint before spending image credits", async () => {
  const source = await fs.readFile("src/routes/preview.js", "utf8");
  const repairStep = source.indexOf('"qa:repair"');
  const coverStep = source.indexOf('step: "draft:cover"');
  assert.ok(repairStep >= 0);
  assert.ok(coverStep > repairStep);
  assert.match(source, /blueprintRepairAgent/);
  assert.match(source, /qa:verify_repair/);
  assert.match(source, /maximumRepairAttempts = 3/);
  const textStep = source.indexOf("draft:text:page:");
  assert.ok(textStep >= 0);
  assert.ok(textStep < coverStep);
  assert.match(source, /pairedText,/);
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

test("all text pages in one book use one stable body font size", () => {
  const width = 1240;
  const common = { width, fontStyle: "handwritten_story", readerAge: 5 };
  const expected = getBodyFontSize(common);
  assert.equal(expected, getBodyFontSize(common));
  assert.equal(expected, 54);
  assert.ok(getBodyFontSize({ width, fontStyle: "handwritten_story", readerAge: 8 }) < expected);
});

test("cover titles use a compact balanced block and the reader exposes a curved page leaf", async () => {
  assert.equal(balanceCoverTitle("Noa y el Dragon"), "Noa y el\nDragon");
  assert.equal(balanceCoverTitle("Luna magique"), "Luna magique");
  const [appSource, cssSource] = await Promise.all([
    fs.readFile("public/app.js", "utf8"),
    fs.readFile("public/styles.css", "utf8"),
  ]);
  assert.match(appSource, /readerCurlFront/);
  assert.match(appSource, /singlePageTurn/);
  assert.match(cssSource, /@keyframes pageCurlForward/);
  assert.match(cssSource, /border-radius: 34%/);
  assert.match(cssSource, /pageCurlShade/);
});

test("ebook PDF preserves square pages and includes cover plus interiors", async () => {
  const outputsDir = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-ebook-"));
  try {
    const pageNames = ["cover.png", "page-1.png", "page-2.png"];
    for (const [index, name] of pageNames.entries()) {
      await sharp({ create: { width: 300, height: 300, channels: 3, background: index ? "#fff8ed" : "#29464a" } }).png().toFile(path.join(outputsDir, name));
    }
    const ebookUrl = await createEbookPdf({
      jobId: "test-book",
      title: "Test book",
      coverPreviewUrl: "/outputs/cover.png",
      pages: [
        { page_number: 2, previewUrl: "/outputs/page-2.png" },
        { page_number: 1, previewUrl: "/outputs/page-1.png" },
      ],
      outputsDir,
    });
    assert.equal(ebookUrl, "/outputs/ebook-test-book.pdf");
    const pdf = await PDFDocument.load(await fs.readFile(path.join(outputsDir, "ebook-test-book.pdf")));
    assert.equal(pdf.getPageCount(), 3);
    assert.ok(pdf.getPages().every((page) => Math.abs(page.getWidth() - EBOOK_PAGE_SIZE_PT) < 0.01 && Math.abs(page.getHeight() - EBOOK_PAGE_SIZE_PT) < 0.01));
  } finally {
    await fs.rm(outputsDir, { recursive: true, force: true });
  }
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
