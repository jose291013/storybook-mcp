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
import { ILLUSTRATION_STYLES, RENDERING_MODES } from "../src/config/illustrationStyles.js";
import { getWordsTargetByAge } from "../src/agents/textWriter.js";
import { buildReadingGuidanceProfiles, readingGuidanceForAge } from "../src/config/readingGuidance.js";
import { buildFinalPrompt, prioritizeVisualReferences } from "../src/services/imageRunner.js";
import { buildImageCharacterAliases } from "../src/services/imageVisualContract.js";
import { buildSceneContinuity } from "../src/services/visualContinuity.js";
import { canonicalizeWrittenNames, lockBlueprintContinuity } from "../src/agents/blueprintFiller.js";
import { sceneContractImagePrompt } from "../src/agents/storyScenePlanner.js";
import { buildNarrativeContext } from "../src/services/buildNarrativeContext.js";
import { ALLOWED_PAGE_COUNTS, calculateBookPrice, EBOOK_PAGE_PRICE_EUR, PAGE_PRICE_EUR, TYPOGRAPHY_OPTIONS, UNIVERSE_OPTIONS } from "../src/config/bookOptions.js";
import { getProductAvailability, isProductEnabled } from "../src/config/productAvailability.js";
import { IMPROVABLE_QUESTION_IDS } from "../src/routes/improveAnswer.js";
import { createEbookPdf, EBOOK_PAGE_SIZE_PT, orderEbookPages } from "../src/services/createEbookPdf.js";
import { extractBlueprintCandidate } from "../src/services/extractBlueprintCandidate.js";
import { PDFDocument } from "pdf-lib";
import PhpParser from "php-parser";
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
import {
  LEGACY_PREVIEW_PRICE_CENTS_BY_PAGE_COUNT,
  previewGenerationContract,
  previewPriceCents,
  PREVIEW_PRICE_CENTS_BY_PAGE_COUNT,
} from "../src/config/previewPricing.js";
import { DIGITAL_PRICING_VERSION_V1 } from "../src/config/productPricing.js";
import { configuredPromoCodes, InsufficientCreditError, JsonCreditStore, PostgresCreditStore } from "../src/services/creditStore.js";
import { signBookOrderWebhook, signCommercePayload, verifyBookOrderWebhook } from "../src/services/commerceToken.js";
import { JsonCommerceOrderStore } from "../src/services/commerceOrderStore.js";
import { LocalDeliveryStorage } from "../src/services/deliveryStorage.js";
import { signDeliveryToken, verifyDeliveryToken } from "../src/services/deliveryToken.js";
import { EBOOK_LAYOUT_ID, freshEbookDeliveryLink, fulfillPaidBookOrder } from "../src/services/ebookFulfillment.js";
import { persistPreviewAsset, storageBodyToBuffer } from "../src/services/previewAssetStorage.js";
import { outputImagePath } from "../src/services/imageQualityGate.js";
import { loadReferencePhotoAssets, persistReferencePhoto } from "../src/services/referencePhotoStorage.js";
import { referencePhotoRecoveryAvailable } from "../src/services/referencePhotoRecovery.js";
import { parseJsonSafe } from "../src/services/parseJsonSafe.js";
import {
  APPROVED_COVER_REFERENCE_POLICY,
  createApprovedCoverVisualBible,
  visualBibleCoverStorageKey,
} from "../src/services/visualBible.js";

test("agent JSON parsing accepts fenced output and extracts one balanced object safely", () => {
  assert.deepEqual(parseJsonSafe('```json\n{"storybrand":{"hero":"Noa"}}\n```'), {
    storybrand: { hero: "Noa" },
  });
  assert.deepEqual(parseJsonSafe('Result: {"storybrand":{"guide_name":"Luma"}} trailing text'), {
    storybrand: { guide_name: "Luma" },
  });
  assert.deepEqual(parseJsonSafe('{"first":1} {"second":2}'), { first: 1 });
});

test("OpenAI agent runner enforces JSON mode and retries with the original context", async () => {
  const [openaiSource, runnerSource, scenePlannerSource, textWriterSource] = await Promise.all([
    fs.readFile("src/services/openai.js", "utf8"),
    fs.readFile("src/services/agentRunner.js", "utf8"),
    fs.readFile("src/agents/storyScenePlanner.js", "utf8"),
    fs.readFile("src/agents/textWriter.js", "utf8"),
  ]);
  assert.match(openaiSource, /response_format:\s*\{\s*type:\s*["']json_object["']/);
  assert.match(openaiSource, /input:\s*jsonInput\(user\)/);
  assert.match(openaiSource, /Return one valid JSON object/);
  assert.match(textWriterSource, /JSON INPUT DATA/);
  assert.match(runnerSource, /const originalUser = user\(input\)/);
  assert.match(runnerSource, /INVALID_PREVIOUS_OUTPUT/);
  assert.match(runnerSource, /clientKind/);
  assert.match(scenePlannerSource, /clientKind:\s*["']story["']/);
});

test("whole-book scene planning covers every spread in 36- and 44-page books", () => {
  for (const pageCount of [36, 44]) {
    const plan = createPagePlan(pageCount);
    const textPages = plan.filter((page) => ["text", "opening_text", "closing_text"].includes(page.page_type));
    const imagePages = plan.filter((page) => page.page_type === "image");
    assert.equal(plan.length, pageCount);
    assert.equal(textPages.length + imagePages.length, pageCount);
    assert.equal(imagePages.length, (pageCount - 2) / 2);
    assert.ok(imagePages.every((imagePage) => plan.some((page) => (
      page.page_type === "text" && page.spread_number === imagePage.spread_number
    ))));
  }
});

test("questionnaire contains nine simple questions without duplicating the photo cast", () => {
  assert.equal(BOOK_QUESTIONS.length, 9);
  assert.equal(new Set(BOOK_QUESTIONS.map((question) => question.id)).size, 9);
  assert.deepEqual(BOOK_QUESTIONS.map((question) => question.id), [
    "hero_name",
    "age",
    "favorite_activities",
    "personality",
    "dream",
    "challenge",
    "message",
    "signature_object",
    "universe",
  ]);
});

test("reference photos are normalized into private durable storage before generation", async () => {
  const privateDir = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-reference-private-"));
  try {
    const storage = new LocalDeliveryStorage(privateDir);
    const source = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#c9865c" } }).png().toBuffer();
    const stored = await persistReferencePhoto({ body: source, storage });
    assert.match(stored.id, /^[a-f0-9-]{36}$/);
    assert.match(stored.storageKey, /^reference-photos\/[a-f0-9-]{36}\.jpg$/);
    const assets = await loadReferencePhotoAssets([{ id: stored.id, storageKey: stored.storageKey }], { storage });
    const metadata = await sharp(assets.get(stored.id).buffer).metadata();
    assert.equal(metadata.format, "jpeg");
    assert.ok(metadata.width <= 1600 && metadata.height <= 1600);
  } finally {
    await fs.rm(privateDir, { recursive: true, force: true });
  }
});

test("preview validates every private reference before reserving credit and never exposes uploads publicly", async () => {
  const [previewSource, serverSource] = await Promise.all([
    fs.readFile("src/routes/preview.js", "utf8"),
    fs.readFile("src/server.js", "utf8"),
  ]);
  assert.ok(previewSource.indexOf("loadReferencePhotoAssets(normalized.photos)") < previewSource.indexOf("creditStore.reservePreview"));
  assert.doesNotMatch(serverSource, /express\.static\(["']data\/uploads/);
});

test("only legacy previews missing character references receive the one-time free rebuild", () => {
  const legacy = {
    status: "preview_ready",
    createdAt: "2026-07-19T12:00:00.000Z",
    previewResult: { coverPreviewUrl: "/cover.png" },
    photoRefs: [{ id: "legacy-child.jpg", role: "child" }],
    continuitySnapshot: { characterCanons: [] },
  };
  assert.equal(referencePhotoRecoveryAvailable(legacy), true);
  assert.equal(referencePhotoRecoveryAvailable({
    ...legacy,
    continuitySnapshot: { referenceRecovery: { requestedAt: "2026-07-19T12:30:00.000Z" } },
  }), false);
  assert.equal(referencePhotoRecoveryAvailable({
    ...legacy,
    createdAt: "2026-07-20T12:00:00.000Z",
  }), false);
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
  assert.equal(verified.destination, "creator");
  assert.ok(verified.nonce.length >= 20);
  const readerState = createWooAuthState({ projectId: "project-291013", destination: "interactive_reader" }, secret);
  assert.equal(verifyWooAuthState(readerState, secret).destination, "interactive_reader");
  const resumeState = createWooAuthState({ projectId: "project-291013", destination: "project_resume" }, secret);
  assert.equal(verifyWooAuthState(resumeState, secret).destination, "project_resume");
  const creditReturnState = createWooAuthState({
    projectId: "project-291013",
    destination: "credit_return",
    creditContext: "modification",
    creditStatus: "paid",
  }, secret);
  assert.deepEqual(
    {
      destination: verifyWooAuthState(creditReturnState, secret).destination,
      context: verifyWooAuthState(creditReturnState, secret).creditContext,
      status: verifyWooAuthState(creditReturnState, secret).creditStatus,
    },
    { destination: "credit_return", context: "modification", status: "paid" },
  );
  const sanitizedCreditReturn = createWooAuthState({
    projectId: "project-291013",
    destination: "credit_return",
    creditContext: "https://example.com",
    creditStatus: "forged",
  }, secret);
  assert.equal(verifyWooAuthState(sanitizedCreditReturn, secret).creditContext, "preview");
  assert.equal(verifyWooAuthState(sanitizedCreditReturn, secret).creditStatus, "back");
  const unsafeState = createWooAuthState({ projectId: "project-291013", destination: "https://example.com" }, secret);
  assert.equal(verifyWooAuthState(unsafeState, secret).destination, "creator");
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
  assert.match(html, /id="resultNewBookButton"/);
  assert.match(html, /id="accountStatus"/);
  assert.match(html, /id="logoutButton"/);
  assert.match(app, /localStorage\.removeItem\(LOCAL_DRAFT_KEY\)/);
  assert.match(app, /localStorage\.removeItem\(PENDING_PREVIEW_KEY\)/);
  assert.match(app, /searchParams\.set\("newBook", Date\.now\(\)\.toString\(\)\)/);
  assert.match(app, /window\.location\.replace\(reloadUrl\.toString\(\)\)/);
  assert.match(app, /resultNewBookButton\.addEventListener\("click", startNewBook\)/);
  assert.match(app, /const saved = newBookRequested \? null : readLocalDraft\(\)/);
  assert.match(app, /fetch\("\/api\/auth\/logout", \{ method: "POST" \}\)/);
  assert.match(app, /refreshCustomerSession\(\)/);
  assert.match(app, /setPreviewComplete\(true\)/);
  assert.match(app, /!state\.previewComplete/);
  assert.match(app, /\["preview_ready", "preview_repairing", "purchased"\]\.includes\(project\?\.status\)/);
  assert.match(app, /final_blueprint: project\.finalBlueprint/);
  assert.match(app, /else await restoreCompletedPreview\(\)/);
  const resumeAfterLogin = app.slice(app.indexOf("async function resumePreviewAfterLogin"), app.indexOf("function loadSeriesDraft"));
  assert.match(resumeAfterLogin, /const restored = await restoreCompletedPreview\(\)/);
  assert.match(resumeAfterLogin, /if \(!restored\) await preparePreviewAuthorization\(projectId\)/);
  assert.match(html, /id="actionReadInteractive"/);
  assert.match(html, /assets\/brand\/calitiki-logo-transparent\.png/);
  assert.match(app, /\/interactive-reader\/\?project=/);
  assert.match(app, /pageCountOptions\?\.\[0\]\?\.generationPriceEur/);
  assert.match(html, /Génération dès 4,44 € TTC/);
  assert.match(styles, /\[hidden\] \{ display: none !important; \}/);
});

test("the Calitiki theme starts a localized creator flow and contains the WooCommerce account layout fix", async () => {
  const [themeFunctions, themeStyles, frontPage, themeScript, header, app, creatorHtml, i18n] = await Promise.all([
    fs.readFile("wordpress/calitiki-theme/functions.php", "utf8"),
    fs.readFile("wordpress/calitiki-theme/assets/css/theme.css", "utf8"),
    fs.readFile("wordpress/calitiki-theme/front-page.php", "utf8"),
    fs.readFile("wordpress/calitiki-theme/assets/js/theme.js", "utf8"),
    fs.readFile("wordpress/calitiki-theme/header.php", "utf8"),
    fs.readFile("public/app.js", "utf8"),
    fs.readFile("public/index.html", "utf8"),
    fs.readFile("public/i18n.js", "utf8"),
  ]);
  assert.match(themeFunctions, /'uiLanguage' => calitiki_creator_language\(\)/);
  assert.match(themeFunctions, /'bookLanguage' => calitiki_creator_language\(\)/);
  assert.match(themeFunctions, /trp_custom_language_switcher\(\)/);
  assert.match(themeFunctions, /shortcode_exists\('language-switcher'\)/);
  assert.match(themeFunctions, /do_shortcode\('\[language-switcher\]'\)/);
  assert.match(themeFunctions, /flag_link/);
  assert.match(themeFunctions, /current_page_url/);
  assert.match(header, /calitiki_language_switcher\(\)/);
  assert.match(themeStyles, /\.calitiki-language-switcher/);
  assert.match(themeStyles, /\.calitiki-translatepress-switcher/);
  assert.match(app, /searchParams\.get\("uiLanguage"\)/);
  assert.match(app, /searchParams\.get\("bookLanguage"\)/);
  assert.match(app, /navigator\.languages/);
  assert.match(app, /bookLanguageLocked/);
  assert.match(app, /renderQuestions\(renderedValues\)/);
  assert.match(app, /referrer\.hostname === "calitiki\.com"/);
  assert.match(themeFunctions, /livre-enfant-personnalise-ebook/);
  assert.match(themeFunctions, /livre-enfant-personnalise-imprime/);
  assert.match(themeFunctions, /CALITIKI_THEME_VERSION', '1\.2\.2'/);
  assert.match(themeFunctions, /'libraryUrl' => calitiki_creations_url\(\)/);
  assert.match(themeFunctions, /wc_get_account_endpoint_url\('calitiki-creations'\)/);
  assert.match(header, /account-link-creations/);
  assert.match(header, /Mes créations/);
  assert.match(themeStyles, /\.woocommerce-account \.woocommerce-MyAccount-navigation[^}]*width:100%!important/);
  assert.match(themeStyles, /\.woocommerce-account \.woocommerce-Addresses\{display:grid/);
  assert.match(themeStyles, /\.woocommerce-account \.woocommerce-Address-title h3\{[^}]*word-break:normal/);
  assert.match(frontPage, /id="tous-les-univers" hidden/);
  assert.match(frontPage, /cloud-castle\.webp/);
  assert.match(frontPage, /dinosaur-valley\.webp/);
  assert.match(frontPage, /wonder-city\.webp/);
  assert.match(frontPage, /calitiki_product_url\('ebook'\)/);
  assert.doesNotMatch(frontPage, /calitiki_product_url\('print'\)/);
  assert.match(frontPage, /À partir de 8,88 € TTC · Découvrir/);
  assert.match(frontPage, /Prochainement disponible/);
  assert.match(frontPage, /Pas encore disponible à l’achat/);
  assert.match(frontPage, /eBook PDF/);
  assert.match(frontPage, /Achat facultatif après génération/);
  assert.match(frontPage, /lecture interactive privée reste accessible même sans cet achat/);
  assert.match(frontPage, /Ce que vous aimeriez lui transmettre devient une aventure/);
  assert.match(frontPage, /id="exemples"/);
  assert.match(frontPage, /L’intention de l’adulte/);
  assert.match(frontPage, /Voix synthétique générée par intelligence artificielle/);
  assert.match(frontPage, /Photos et livre jamais rendus publics/);
  assert.doesNotMatch(frontPage, /StoryBrand/);
  assert.match(themeStyles, /\.format-card-coming-soon/);
  assert.match(themeStyles, /\.story-example-grid/);
  assert.match(themeStyles, /\.listen-card/);
  assert.match(themeStyles, /\.trust-card-grid/);
  assert.match(themeStyles, /\.meaning-arrow\{[^}]*left:clamp\(270px,55%,305px\)/);
  assert.match(themeStyles, /@media\(max-width:560px\)[\s\S]*\.meaning-hero__visual\{display:flex/);
  assert.match(themeScript, /data-universe-toggle/);
  assert.match(themeFunctions, /data-calitiki-language-switcher/);
  assert.match(themeScript, /navigator\.languages/);
  assert.match(themeScript, /calitiki-language-preference/);
  assert.match(themeScript, /woocommerce-MyAccount-content/);
  assert.match(themeScript, /scrollIntoView/);
  assert.match(themeStyles, /--calitiki-mobile-menu-top/);
  assert.match(app, /safeCalitikiCreationsUrl/);
  assert.match(app, /CREATIONS_RETURN_KEY/);
  assert.match(app, /headerCreationsLink\.href = creationsReturnUrl\(\)/);
  assert.match(creatorHtml, /id="headerCreationsLink"/);
  assert.match(creatorHtml, /data-i18n="aiDisclosureTitle"/);
  assert.match(creatorHtml, /data-i18n="photoPrivacyNote"/);
  assert.match(i18n, /myCreations: "Mes créations"/);
  assert.match(i18n, /Création assistée par intelligence artificielle/);
});

test("new generation prices are 0.185 euro per page and include the interactive reader only", () => {
  assert.deepEqual(LEGACY_PREVIEW_PRICE_CENTS_BY_PAGE_COUNT, { 24: 250, 28: 300, 32: 350, 36: 400, 40: 450, 44: 500 });
  assert.deepEqual(PREVIEW_PRICE_CENTS_BY_PAGE_COUNT, { 24: 444, 28: 518, 32: 592, 36: 666, 40: 740, 44: 814 });
  assert.equal(previewPriceCents(24), 250);
  assert.equal(previewPriceCents(44), 500);
  assert.equal(previewPriceCents(24, DIGITAL_PRICING_VERSION_V1), 444);
  assert.equal(previewPriceCents(44, DIGITAL_PRICING_VERSION_V1), 814);
  assert.deepEqual(previewGenerationContract(32, DIGITAL_PRICING_VERSION_V1), {
    version: "generation_ttc_0185_v1",
    pageCount: 32,
    requiredCents: 592,
    unitPagePriceEur: 0.185,
    interactiveReaderIncluded: true,
    ebookIncluded: false,
  });
});

test("promotion credit is redeemable once per customer and successful preview spend becomes a project rebate", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-credits-"));
  const previousCodes = process.env.PREVIEW_PROMO_CODES;
  process.env.PREVIEW_PROMO_CODES = "LANCEMENT250:250,LANCEMENT500:500";
  try {
    assert.equal(configuredPromoCodes().size, 2);
    const customerStore = { async ensureCustomer(identity) { return { id: `customer-${identity.wooCustomerId}` }; } };
    const store = new JsonCreditStore(path.join(directory, "credits.json"), customerStore);
    const identity = { wooCustomerId: "42", email: "parent@example.com" };
    const granted = await store.redeem(identity, { code: "lancement250", projectId: "project-1" });
    assert.equal(granted.balanceCents, 250);
    await assert.rejects(() => store.redeem(identity, { code: "LANCEMENT250", projectId: "project-1" }), /already used/);
    await assert.rejects(() => store.reservePreview(identity, { projectId: "project-1", amountCents: 300, idempotencyKey: "too-much" }), InsufficientCreditError);
    const reservation = await store.reservePreview(identity, { projectId: "project-1", amountCents: 250, idempotencyKey: "preview-1" });
    assert.equal((await store.summary(identity, "project-1")).balanceCents, 0);
    await store.capturePreview(reservation.id);
    assert.deepEqual(await store.summary(identity, "project-1"), { balanceCents: 0, rebateCents: 250 });
    const secondGrant = await store.redeem(identity, { code: "LANCEMENT500", projectId: "project-1" });
    assert.equal(secondGrant.balanceCents, 500);
    const released = await store.reservePreview(identity, { projectId: "project-1", amountCents: 500, idempotencyKey: "preview-2" });
    await store.releasePreview(released.id);
    assert.equal((await store.summary(identity, "project-1")).balanceCents, 500);
    await store.reservePreview(identity, { projectId: "project-1", amountCents: 250, idempotencyKey: "preview-abandoned" });
    assert.equal((await store.summary(identity, "project-1")).balanceCents, 250);
    assert.deepEqual(await store.releasePreviewForProject(identity, { projectId: "project-1" }), { projectId: "project-1", releasedCount: 1 });
    assert.deepEqual(await store.releasePreviewForProject(identity, { projectId: "project-1" }), { projectId: "project-1", releasedCount: 0 });
    assert.equal((await store.summary(identity, "project-1")).balanceCents, 500);
    await store.grantPaidOrder(identity, { amountCents: 250, orderId: "woo-1001" });
    await store.grantPaidOrder(identity, { amountCents: 250, orderId: "woo-1001" });
    assert.equal((await store.summary(identity, "project-1")).balanceCents, 750);
    const history = await store.history(identity);
    assert.equal(history.filter((entry) => entry.entryType === "woocommerce_credit_purchase").length, 1);
    assert.ok(history.some((entry) => entry.entryType === "promotion_grant"));
    assert.ok(history.some((entry) => entry.entryType === "preview_reserve"));
  } finally {
    if (previousCodes === undefined) delete process.env.PREVIEW_PROMO_CODES; else process.env.PREVIEW_PROMO_CODES = previousCodes;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("a successful technical retry captures its released preview once and creates one rebate", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-retry-rebate-"));
  const previousCodes = process.env.PREVIEW_PROMO_CODES;
  process.env.PREVIEW_PROMO_CODES = "RETRY500:500";
  try {
    const customerStore = { async ensureCustomer(identity) { return { id: `customer-${identity.wooCustomerId}` }; } };
    const store = new JsonCreditStore(path.join(directory, "credits.json"), customerStore);
    const identity = { wooCustomerId: "42", email: "parent@example.com" };
    await store.redeem(identity, { code: "RETRY500", projectId: "project-retry" });
    const preview = await store.reservePreview(identity, {
      projectId: "project-retry",
      amountCents: 400,
      idempotencyKey: "preview-retry",
    });
    await store.releasePreview(preview.id);
    assert.deepEqual(await store.summary(identity, "project-retry"), { balanceCents: 500, rebateCents: 0 });

    await store.capturePreview(preview.id);
    await store.capturePreview(preview.id);
    assert.deepEqual(await store.summary(identity, "project-retry"), { balanceCents: 100, rebateCents: 400 });
    const history = await store.history(identity);
    assert.equal(history.filter((entry) => entry.entryType === "preview_retry_capture").length, 1);
    const persisted = JSON.parse(await fs.readFile(path.join(directory, "credits.json"), "utf8"));
    assert.equal(persisted.rebates.filter((rebate) => rebate.reservationId === preview.id).length, 1);
  } finally {
    if (previousCodes === undefined) delete process.env.PREVIEW_PROMO_CODES; else process.env.PREVIEW_PROMO_CODES = previousCodes;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("PostgreSQL settles a released retry atomically and idempotently", async () => {
  const reservation = {
    id: "11111111-1111-4111-8111-111111111111",
    customer_id: "22222222-2222-4222-8222-222222222222",
    project_id: "33333333-3333-4333-8333-333333333333",
    amount_cents: 400,
    status: "released",
  };
  let walletDebits = 0;
  let rebates = 0;
  const client = {
    async query(sql, params = []) {
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
      if (sql.startsWith("SELECT * FROM preview_credit_reservations")) return { rows: [{ ...reservation }] };
      if (sql.startsWith("INSERT INTO credit_wallet_entries")) {
        walletDebits += 1;
        assert.equal(params[3], -400);
        assert.equal(params[4], `retry-capture:${reservation.id}`);
        return { rows: [] };
      }
      if (sql.startsWith("UPDATE preview_credit_reservations")) {
        reservation.status = "captured";
        return { rows: [{ ...reservation }] };
      }
      if (sql.startsWith("INSERT INTO project_purchase_rebates")) {
        rebates += 1;
        assert.equal(params[4], 400);
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in retry settlement test: ${sql}`);
    },
    release() {},
  };
  const store = new PostgresCreditStore({ async connect() { return client; } }, null);
  await store.capturePreview(reservation.id);
  await store.capturePreview(reservation.id);
  assert.equal(walletDebits, 1);
  assert.equal(rebates, 1);
  assert.equal(reservation.status, "captured");
});

test("paid WooCommerce credit products grant wallet value through a signed idempotent webhook", async () => {
  const [plugin, route, store] = await Promise.all([
    fs.readFile("wordpress/calitiki-bridge/calitiki-bridge.php", "utf8"),
    fs.readFile("src/routes/commerceCredits.js", "utf8"),
    fs.readFile("src/services/creditStore.js", "utf8"),
  ]);
  assert.match(plugin, /_calitiki_credit_cents/);
  assert.match(plugin, /woocommerce_payment_complete/);
  assert.match(plugin, /X-Calitiki-Signature/);
  assert.match(plugin, /hash_hmac\('sha256'/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /creditStore\.grantPaidOrder/);
  assert.match(store, /woo-credit-order:/);
  assert.match(store, /ON CONFLICT \(idempotency_key\) DO NOTHING/);
});

test("preview generation reserves credits before work and captures or releases them idempotently", async () => {
  const [previewSource, creditsRoute, html, app] = await Promise.all([
    fs.readFile("src/routes/preview.js", "utf8"),
    fs.readFile("src/routes/credits.js", "utf8"),
    fs.readFile("public/index.html", "utf8"),
    fs.readFile("public/app.js", "utf8"),
  ]);
  assert.match(previewSource, /creditStore\.reservePreview/);
  assert.match(previewSource, /creditStore\.capturePreview/);
  assert.match(previewSource, /creditStore\.releasePreview/);
  assert.match(previewSource, /creditStore\.releasePreviewForProject/);
  assert.match(previewSource, /isActivePreviewJob/);
  assert.match(previewSource, /resumed: true/);
  assert.match(previewSource, /status\(402\)/);
  assert.match(creditsRoute, /\/credits\/redeem/);
  assert.match(html, /id="creditPanel"/);
  assert.match(html, /id="previewActionCenter"/);
  assert.match(html, /id="confirmPreviewButton"/);
  assert.match(html, /id="headerCreditBalance"/);
  assert.match(html, /id="storefrontReturnLink"/);
  assert.match(html, /id="generationFailureFeedback"/);
  assert.match(app, /preparePreviewAuthorization/);
  assert.match(app, /project\?\.status === "preview_generating"/);
  assert.doesNotMatch(app, /await generatePreviewForProject\(project\.id\)/);
  assert.match(app, /preview-recover/);
  assert.match(app, /retryPreviewFree/);
  assert.match(app, /generationRetryRejected/);
  assert.match(app, /showGenerationFailure\(null, tr\("generationRetryRejected"\)\)/);
  assert.match(previewSource, /mergeGenerationCheckpoint/);
  assert.match(previewSource, /previewRequestFingerprintCandidates/);
  const checkpointDeclaration = previewSource.indexOf("let checkpoint = initialCheckpoint;");
  const backgroundGeneration = previewSource.indexOf("withOpenAICostContext({", checkpointDeclaration);
  assert.ok(checkpointDeclaration > -1 && checkpointDeclaration < backgroundGeneration, "checkpoint must remain visible to the background catch handler");
  assert.match(previewSource, /completedPageNumbers/);
  assert.match(app, /confirmPreviewAuthorization/);
  assert.doesNotMatch(app, /hasPreviewEntitlement/);
  assert.match(app, /confirmPreviewButton\.addEventListener\("click", confirmPreviewAuthorization\)/);
  assert.match(app, /safeCalitikiReturnUrl/);
  assert.match(app, /calitiki_connect/);
  assert.match(app, /https:\/\/calitiki\.com\/es\//);
});

test("WooCommerce My Account exposes the signed wallet balance and transaction history", async () => {
  const [plugin, route, store] = await Promise.all([
    fs.readFile("wordpress/calitiki-bridge/calitiki-bridge.php", "utf8"),
    fs.readFile("src/routes/commerceCredits.js", "utf8"),
    fs.readFile("src/services/creditStore.js", "utf8"),
  ]);
  assert.match(plugin, /woocommerce_account_menu_items/);
  assert.match(plugin, /woocommerce_account_calitiki-credits_endpoint/);
  assert.match(plugin, /Mes crédits Calitiki/);
  assert.match(plugin, /wallet\|/);
  assert.match(route, /\/commerce\/wallet/);
  assert.match(route, /creditStore\.history/);
  assert.match(store, /async history\(identity/);
});

test("personalized checkout reserves one project rebate and requires a signed WooCommerce cart entry", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-checkout-"));
  const previousCodes = process.env.PREVIEW_PROMO_CODES;
  process.env.PREVIEW_PROMO_CODES = "CHECKOUT250:250";
  try {
    const customerStore = { async ensureCustomer(identity) { return { id: `customer-${identity.wooCustomerId}` }; } };
    const store = new JsonCreditStore(path.join(directory, "credits.json"), customerStore);
    const identity = { wooCustomerId: "42", email: "parent@example.com" };
    await store.redeem(identity, { code: "CHECKOUT250", projectId: "project-1" });
    const preview = await store.reservePreview(identity, { projectId: "project-1", amountCents: 250, idempotencyKey: "preview-1" });
    await store.capturePreview(preview.id);
    assert.equal((await store.summary(identity, "project-1")).rebateCents, 250);
    const checkout = await store.reserveProjectRebate(identity, { projectId: "project-1", idempotencyKey: "checkout-1" });
    const repeated = await store.reserveProjectRebate(identity, { projectId: "project-1", idempotencyKey: "checkout-2" });
    assert.equal(checkout.amountCents, 250);
    assert.equal(repeated.id, checkout.id);
    assert.equal((await store.summary(identity, "project-1")).rebateCents, 0);
    await store.releaseCheckout(checkout.id, "1001");
    assert.equal((await store.summary(identity, "project-1")).rebateCents, 250);
    const retry = await store.reserveProjectRebate(identity, { projectId: "project-1", idempotencyKey: "checkout-3" });
    await store.captureCheckout(retry.id, "1002");
    assert.equal((await store.summary(identity, "project-1")).rebateCents, 0);

    const token = signCommercePayload({ sub: "42", projectId: "project-1", exp: Math.floor(Date.now() / 1000) + 600 }, "a".repeat(64));
    assert.equal(token.split(".").length, 2);
    const [plugin, route, html, app] = await Promise.all([
      fs.readFile("wordpress/calitiki-bridge/calitiki-bridge.php", "utf8"),
      fs.readFile("src/routes/commerceCheckout.js", "utf8"),
      fs.readFile("public/index.html", "utf8"),
      fs.readFile("public/app.js", "utf8"),
    ]);
    assert.match(plugin, /validate_personalized_add_to_cart/);
    assert.match(plugin, /calitiki_project_id/);
    assert.match(plugin, /Crédit d’aperçu déduit/);
    assert.match(route, /\/commerce\/checkout-link/);
    assert.match(route, /reserveProjectRebate/);
    assert.ok(route.indexOf("capturePreview(previewReservationId)") < route.indexOf("reserveProjectRebate(identity"));
    assert.match(route, /isProductEnabled\(productType\)/);
    assert.match(route, /project\.status === "preview_ready"/);
    assert.match(html, /id="actionBuyEbook"/);
    assert.match(html, /id="actionBuyPrint" disabled aria-disabled="true"/);
    assert.match(app, /openConfiguredCheckout/);
    assert.match(app, /is-coming-soon/);
  } finally {
    if (previousCodes === undefined) delete process.env.PREVIEW_PROMO_CODES; else process.env.PREVIEW_PROMO_CODES = previousCodes;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("printed books stay disabled until the production feature flag is enabled", () => {
  assert.equal(isProductEnabled("ebook", {}), true);
  assert.equal(isProductEnabled("print", {}), false);
  assert.equal(getProductAvailability({}).print.status, "coming_soon");
  assert.equal(isProductEnabled("print", { PRINT_BOOK_ENABLED: "true" }), true);
  assert.equal(getProductAvailability({ PRINT_BOOK_ENABLED: "1" }).print.status, "available");
});

test("paid and zero-total WooCommerce orders use the same signed ebook fulfillment flow", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-delivery-"));
  const outputsDir = path.join(directory, "outputs");
  await fs.mkdir(outputsDir, { recursive: true });
  try {
    for (const [index, name] of ["cover.png", "page-1.png"].entries()) {
      await sharp({ create: { width: 240, height: 240, channels: 3, background: index ? "#fff8ed" : "#29464a" } }).png().toFile(path.join(outputsDir, name));
    }
    const identity = { wooCustomerId: "42", email: "parent@example.com" };
    const projects = new JsonProjectStore(path.join(directory, "projects.json"));
    const customer = await projects.ensureCustomer(identity);
    let project = await projects.create({
      customerId: customer.id, status: "preview_ready", title: "Noa et Luma", locale: "FR",
      finalBlueprint: { language: "FR", cover: { title: "Noa et Luma" } },
    });
    const orders = new JsonCommerceOrderStore(path.join(directory, "orders.json"));
    const storage = new LocalDeliveryStorage(path.join(directory, "private"));
    const coverAsset = await persistPreviewAsset({ projectId: project.id, assetUrl: "/outputs/cover.png", outputsDir, storage });
    const pageAsset = await persistPreviewAsset({ projectId: project.id, assetUrl: "/outputs/page-1.png", outputsDir, storage });
    assert.equal(coverAsset.mimeType, "image/png");
    assert.equal(coverAsset.width, 240);
    assert.equal(coverAsset.height, 240);
    assert.match(coverAsset.sha256, /^[a-f0-9]{64}$/);
    assert.ok(coverAsset.byteLength > 0);
    assert.equal((await storageBodyToBuffer((await storage.get(coverAsset.storageKey)).body)).length > 0, true);
    project = await projects.update(project.id, {
      previewResult: {
        coverPreviewUrl: coverAsset.previewUrl,
        coverStorageKey: coverAsset.storageKey,
        draftPages: [{ page_number: 1, previewUrl: pageAsset.previewUrl, storageKey: pageAsset.storageKey }],
      },
    });
    await fs.rm(outputsDir, { recursive: true, force: true });
    const options = { projectStore: projects, commerceOrderStore: orders, deliveryStorage: storage, outputsDir, deliveryUrlOptions: { baseUrl: "https://books.example", secret: "s".repeat(64), expiresInSeconds: 3600 } };
    const delivery = await fulfillPaidBookOrder({ orderId: "1001", projectId: project.id, productType: "ebook", pageCount: 24, orderTotalCents: 0, ...identity }, options);
    assert.equal(delivery.status, "ready");
    assert.match(delivery.downloadUrl, /^https:\/\/books\.example\/api\/deliveries\/ebook\//);
    const record = await orders.findForCustomer({ orderId: "1001", projectId: project.id, wooCustomerId: "42", productType: "ebook" });
    assert.equal(record.orderTotalCents, 0);
    assert.equal(record.paymentStatus, "paid");
    assert.match(record.storageKey, new RegExp(`book-${EBOOK_LAYOUT_ID}\\.pdf$`));
    assert.equal((await storage.get(record.storageKey)).contentType, "application/pdf");
    assert.equal((await freshEbookDeliveryLink({ orderId: "1001", projectId: project.id, wooCustomerId: "42" }, options)).status, "ready");
    await orders.recordStatus({ orderId: "1001", projectId: project.id, productType: "ebook", wooCustomerId: "42", status: "refunded" });
    assert.equal(await freshEbookDeliveryLink({ orderId: "1001", projectId: project.id, wooCustomerId: "42" }, options), null);

    const signedPayload = { orderId: "1001", customerId: "42", projectId: project.id, reservationId: "", productType: "ebook", pageCount: 24, orderTotalCents: 0, status: "paid" };
    const signature = signBookOrderWebhook(signedPayload, "b".repeat(64));
    assert.equal(verifyBookOrderWebhook({ ...signedPayload, signature }, "b".repeat(64)), true);
    assert.equal(verifyBookOrderWebhook({ ...signedPayload, orderTotalCents: 1, signature }, "b".repeat(64)), false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("technical image repair is validated, bounded and never spends customer credits", async () => {
  const [preview, repair, quality, app] = await Promise.all([
    fs.readFile("src/routes/preview.js", "utf8"),
    fs.readFile("src/routes/previewRepair.js", "utf8"),
    fs.readFile("src/services/imageQualityGate.js", "utf8"),
    fs.readFile("public/app.js", "utf8"),
  ]);
  assert.equal(outputImagePath("/outputs/page-attempt1.png"), path.resolve("data/outputs/page-attempt1.png"));
  assert.match(preview, /generateQualityCheckedImage/);
  assert.match(preview, /imageStorageKey/);
  assert.match(quality, /abstract noise, repeated bands or stripes/);
  assert.match(quality, /Never compare wardrobe, cast, likeness or narrative accuracy/);
  assert.doesNotMatch(quality, /Expected visible named characters|essential action or setting/);
  assert.match(quality, /IMAGE_GENERATION_ATTEMPTS \|\| "2"/);
  assert.match(quality, /realistic_dimensional/);
  assert.match(quality, /approved-with-style-warning/);
  assert.match(quality, /inspectIdentityLikeness/);
  assert.match(quality, /approved-with-identity-warning/);
  assert.match(quality, /IMAGE_LIKENESS_QA_ENABLED/);
  assert.match(quality, /attempt === attemptLimit/);
  assert.match(quality, /if \(attempt === attemptLimit\) attemptLimit \+= 1/);
  assert.match(repair, /project\.status === "purchased"/);
  assert.match(repair, /status: "preview_repairing"/);
  assert.match(repair, /FREE_TECHNICAL_CHECKS_PER_PROJECT = 3/);
  assert.match(repair, /FREE_TECHNICAL_REPAIRS_PER_PROJECT = 3/);
  assert.match(repair, /TECHNICAL_CHECK_POLICY_VERSION = 3/);
  assert.match(repair, /MAX_FAILED_REPAIR_ATTEMPTS_PER_PAGE = 2/);
  assert.match(repair, /technicalCheckAt: null/);
  assert.match(repair, /\[preview-repair\] failed/);
  assert.match(repair, /inspectStyleConsistency/);
  assert.match(repair, /technicalCheckAt/);
  assert.match(repair, /inspectGeneratedIllustration[\s\S]+generateQualityCheckedImage/);
  assert.match(repair, /maximumAttempts: 2/);
  assert.doesNotMatch(repair, /reservePreview|capturePreview/);
  assert.match(app, /repairCurrentIllustration/);
  assert.match(app, /repairIllustrationNoDefect/);
  assert.match(app, /repairIllustrationLimit/);
  assert.match(app, /repairIllustrationRetryError/);
  assert.match(app, /technicalCheckPolicyVersion/);
  assert.match(app, /preview-pages\/\$\{encodeURIComponent\(pageNumber\)\}\/repair/);
});

test("ebook fulfillment claims prevent duplicate generation and allow stale recovery", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-delivery-claim-"));
  try {
    const orderPath = path.join(directory, "orders.json");
    const orders = new JsonCommerceOrderStore(orderPath);
    const identity = { orderId: "1002", projectId: "project-2", productType: "ebook", wooCustomerId: "42" };
    const paidInput = { ...identity, customerId: "customer-2", pageCount: 24, orderTotalCents: 669 };
    await orders.recordPaid(paidInput);
    assert.equal((await orders.claimDelivery(identity)).fulfillmentStatus, "generating");
    assert.equal(await orders.claimDelivery(identity), null);
    const persisted = JSON.parse(await fs.readFile(orderPath, "utf8"));
    Object.values(persisted.orders)[0].updatedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await fs.writeFile(orderPath, JSON.stringify(persisted), "utf8");
    await orders.recordPaid(paidInput);
    assert.equal((await orders.claimDelivery(identity)).fulfillmentStatus, "generating");
    await orders.updateDelivery(identity, { fulfillmentStatus: "failed", deliveryError: "Input file is missing: data/outputs/old.png" });
    assert.equal((await freshEbookDeliveryLink(identity, { commerceOrderStore: orders })).errorCode, "preview_assets_missing");
    await orders.updateDelivery(identity, { fulfillmentStatus: "ready", storageKey: "ebooks/project-2/1002/book.pdf", deliveryError: "" });
    assert.equal((await orders.claimDelivery(identity, { allowReady: true })).fulfillmentStatus, "generating");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("ebook delivery tokens are signed and expire", () => {
  const secret = "d".repeat(64);
  const token = signDeliveryToken({ projectId: "project-1", orderId: "1001", customerId: "42", storageKey: "ebooks/project-1/book.pdf" }, { secret, expiresInSeconds: 60 });
  assert.equal(verifyDeliveryToken(token, { secret }).projectId, "project-1");
  assert.throws(() => verifyDeliveryToken(token, { secret, now: Date.now() + 120000 }), /expired/);
  assert.throws(() => verifyDeliveryToken(`${token}x`, { secret }), /Invalid delivery token/);
});

test("Calitiki Bridge emails ready ebooks and recognizes coupon-funded zero-total orders", async () => {
  const plugin = await fs.readFile("wordpress/calitiki-bridge/calitiki-bridge.php", "utf8");
  const parser = new PhpParser({ parser: { extractDoc: true }, ast: { withPositions: true } });
  assert.equal(parser.parseCode(plugin).kind, "program");
  assert.match(plugin, /Version: 0\.8\.0/);
  assert.match(plugin, /woocommerce_checkout_order_processed/);
  assert.match(plugin, /get_total\(\) <= 0/);
  assert.match(plugin, /payment_complete\(\)/);
  assert.match(plugin, /send_ebook_ready_email/);
  assert.match(plugin, /admin_post_calitiki_resend_ebook/);
  assert.match(plugin, /Renvoyer l’e-mail/);
  assert.match(plugin, /configuration SMTP/);
  assert.match(plugin, /WC\(\)->mailer\(\)/);
  assert.match(plugin, /maybe_send_preview_ready_email/);
  assert.match(plugin, /calitiki_preview_event/);
  assert.match(plugin, /cover_ready/);
  assert.match(plugin, /generation_failed/);
  assert.match(plugin, /quality_review_required/);
  assert.match(plugin, /retry_available/);
  assert.match(plugin, /hash_equals\(\$expected_signature, \$provided_signature\)/);
  assert.match(plugin, /wp_mail\(\$user->user_email/);
  assert.match(plugin, /store_ebook_resend_notice/);
  assert.match(plugin, /catch \(Throwable \$error\)/);
  const resendHandler = plugin.slice(plugin.indexOf("public static function resend_ebook_email"), plugin.indexOf("public static function settings_link"));
  assert.doesNotMatch(resendHandler, /wc_add_notice/);
  assert.match(plugin, /calitiki_retry_book_order/);
  assert.match(plugin, /woocommerce_account_calitiki-creations_endpoint/);
  assert.match(plugin, /delivery-link\|/);
  assert.match(plugin, /wp_strip_all_tags/);
  assert.match(plugin, /preview_assets_missing/);
  assert.match(plugin, /Lire mon livre interactif/);
  assert.match(plugin, /couter mon livre narr/);
  assert.match(plugin, /Narration IA pr/);
  assert.match(plugin, /narrationReady/);
  assert.match(plugin, /'destination' => 'interactive_reader'/);
  assert.match(plugin, /interactive_reader_bridge_url/);
  assert.match(plugin, /creation_projects_payload/);
  assert.match(plugin, /\/api\/commerce\/creations/);
  assert.match(plugin, /paidProjectIds/);
  assert.match(plugin, /paid_book_orders/);
  assert.match(plugin, /wp_remote_post\(\$generator_url \. '\/api\/commerce\/creations'/);
  assert.match(plugin, /creator_bridge_url/);
  assert.match(plugin, /Aperçu personnalisé/);
  assert.match(plugin, /Voir mon livre/);
  assert.match(plugin, /Vérifier le scénario/);
  assert.match(plugin, /Version: 0\.8\.0/);
  assert.match(plugin, /Pilotage Calitiki/);
  assert.match(plugin, /current_user_can\('manage_woocommerce'\)/);
  assert.match(plugin, /\/api\/internal\/book-costs/);
  assert.match(plugin, /X-Calitiki-Signature/);
  assert.match(plugin, /_calitiki_project_title/);
  assert.match(plugin, /\$project_titles\[\$project_id\]/);
  const creationLibrary = plugin.slice(
    plugin.indexOf("public static function render_account_creations"),
    plugin.indexOf("public static function delete_creation")
  );
  assert.ok(creationLibrary.indexOf("$project_titles[$project_id]") < creationLibrary.indexOf("$item->get_name()"));
  assert.ok(creationLibrary.indexOf("_calitiki_project_title") < creationLibrary.indexOf("$item->get_name()"));
  assert.match(plugin, /preview_quality_review/);
  assert.match(plugin, /Voir la vérification/);
  assert.match(plugin, /Partager avec la famille/);
  assert.match(plugin, /'destination' => 'family_share'/);
  assert.match(plugin, /family_share_bridge_url/);
  assert.match(plugin, /PRINT_BOOK_ENABLED_OPTION/);
  assert.match(plugin, /woocommerce_product_is_purchasable/);
  assert.match(plugin, /calitiki-coming-soon-button/);
  assert.match(plugin, /eBook PDF téléchargeable/);
  assert.match(plugin, /La génération comprend déjà votre livre interactif privé/);
  assert.match(plugin, /Pack numérique personnalisé/);
  assert.match(plugin, /NARRATION_SLUG/);
  assert.match(plugin, /Choisir une narration IA/);
  assert.match(plugin, /calitiki_narration_voice/);
  assert.match(plugin, /product_type.*narration|product_type', 'narration|array\('ebook', 'print', 'narration'\)/);
  assert.match(plugin, /woocommerce_add_cart_item_data/);
  assert.match(plugin, /woocommerce_thankyou/);
  assert.match(plugin, /_calitiki_credit_return_project/);
  assert.match(plugin, /'destination' => 'credit_return'/);
  assert.match(plugin, /Revenir à mon livre/);
  const authRoute = await fs.readFile("src/routes/woocommerceAuth.js", "utf8");
  assert.match(authRoute, /projectStore\.getForCustomer\(state\.projectId, identity\)/);
  assert.match(authRoute, /\/interactive-reader\/\?\$\{params\.toString\(\)\}/);
  assert.match(authRoute, /router\.get\("\/auth\/woocommerce\/reader"/);
  assert.match(authRoute, /destination: "interactive_reader"/);
  assert.match(authRoute, /destination === "credit_return"/);
  assert.match(authRoute, /creditReturn/);
  const creatorApp = await fs.readFile("public/app.js", "utf8");
  assert.match(creatorApp, /calitiki_project/);
  assert.match(creatorApp, /PENDING_CREDIT_PURCHASE_KEY/);
  assert.match(creatorApp, /showCreditReturnNotice/);
  assert.match(creatorApp, /progressCoherence/);
  assert.match(creatorApp, /progressFidelityCheck/);
  assert.match(creatorApp, /progressFidelityRepair/);
  const commerceCredits = await fs.readFile("src/routes/commerceCredits.js", "utf8");
  assert.match(commerceCredits, /creations\|\$\{wooCustomerId\}\|\$\{timestamp\}/);
  assert.match(commerceCredits, /listCustomerCreations/);
  const narrationPage = await fs.readFile("public/narration/index.html", "utf8");
  const narrationApp = await fs.readFile("public/narration/app.js", "utf8");
  const narrationRoute = await fs.readFile("src/routes/narration.js", "utf8");
  assert.match(narrationPage, /data-reader/);
  assert.match(narrationApp, /readerUrl/);
  assert.match(narrationApp, /setTimeout\(\(\) => refreshStatus\(\), 10000\)/);
  assert.match(narrationRoute, /readerUrl: active/);
  const archive = await fs.readFile("wordpress/calitiki-bridge-v0.8.0.zip");
  assert.equal(archive.includes(Buffer.from("calitiki-bridge\\calitiki-bridge.php")), false);
  assert.equal(archive.includes(Buffer.from("calitiki-bridge/calitiki-bridge.php")), true);
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
    source_project_id: null,
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
      if (sql.startsWith("INSERT")) return { rows: [{ ...baseRow, id: params[0], photo_refs: JSON.parse(params[11]) }] };
      if (sql.startsWith("UPDATE")) return { rows: [{ ...baseRow, photo_refs: JSON.parse(params[5]) }] };
      return { rows: [] };
    },
  };
  const store = new PostgresProjectStore(database);
  const photoRefs = [{ url: "/uploads/noa.webp", name: "Noa", role: "child", story_role: "hero" }];

  await store.create({ anonymousOwnerHash: "anonymous-owner", questionnaire: { hero_name: "Noa" }, photoRefs });
  const insert = queries.find(({ sql }) => sql.startsWith("INSERT"));
  assert.equal(typeof insert.params[11], "string");
  assert.deepEqual(JSON.parse(insert.params[11]), photoRefs);

  queries.length = 0;
  await store.update(baseRow.id, { photoRefs });
  const update = queries.find(({ sql }) => sql.startsWith("UPDATE"));
  assert.equal(typeof update.params[5], "string");
  assert.deepEqual(JSON.parse(update.params[5]), photoRefs);
});

test("illustration catalog separates realism from medium with truthful comparison assets", async () => {
  assert.equal(ILLUSTRATION_STYLES.length, 7);
  assert.equal(new Set(ILLUSTRATION_STYLES.map((style) => style.id)).size, 7);
  assert.deepEqual(RENDERING_MODES.map((mode) => mode.id), ["photorealistic", "illustrated_faithful", "cartoon"]);
  assert.ok(ILLUSTRATION_STYLES.every((style) => style.prompt && style.palette.length === 3 && style.referenceImage));
  assert.equal(ILLUSTRATION_STYLES.find((style) => style.id === "photoreal_story").likeness, "maximum");
  assert.match(ILLUSTRATION_STYLES.find((style) => style.id === "gentle_3d").name, /cartoon/i);
  assert.doesNotMatch(ILLUSTRATION_STYLES.find((style) => style.id === "photoreal_story").prompt, /sans photoréalisme/i);
  for (const style of ILLUSTRATION_STYLES) {
    assert.ok((await fs.stat(path.join("public", style.previewImage))).size > 30_000);
    assert.ok((await fs.stat(path.join("public", style.referenceImage))).size > 30_000);
  }
});

test("story pages use richer word targets while opening and closing stay concise", () => {
  assert.deepEqual(getWordsTargetByAge("6", "text"), { target: 70, tolerance: 11 });
  assert.deepEqual(getWordsTargetByAge("6", "opening_text"), { target: 41, tolerance: 8 });
});

test("page guidance recommends an age-appropriate length while preserving every parent choice", () => {
  const shortBook = readingGuidanceForAge(8, 24);
  const longBook = readingGuidanceForAge(8, 40);
  assert.equal(shortBook.recommended, true);
  assert.equal(longBook.recommended, false);
  assert.equal(shortBook.sceneCount, 11);
  assert.equal(longBook.sceneCount, 19);
  assert.ok(longBook.estimatedWords > shortBook.estimatedWords);
  assert.ok(longBook.minutesMax > shortBook.minutesMax);
  const profile = buildReadingGuidanceProfiles().find((item) => item.minAge === 8);
  assert.deepEqual(profile.recommendedPageCounts, [24, 28, 32]);
  assert.deepEqual(profile.options.map((option) => option.pageCount), ALLOWED_PAGE_COUNTS);
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

test("reference characters keep one explicit universe outfit choice", () => {
  const normalized = normalizeBookRequest({
    questionnaire: { hero_name: "Nolan", age: 8, universe_id: "coral_ocean" },
    photos: [{
      id: "nolan.png",
      role: "child",
      story_role: "hero",
      name: "Nolan",
      outfit_preference: "selected",
      outfit_id: "ocean_scientist",
    }],
  });
  assert.equal(normalized.photos[0].outfit_preference, "selected");
  assert.equal(normalized.photos[0].outfit_id, "ocean_scientist");
  assert.match(normalized.photos[0].outfit_contract, /marine exploration suit/i);
});

test("every creator-selected secondary narrative role remains authoritative", () => {
  for (const storyRole of ["guide", "ally", "companion", "supporter", "guest"]) {
    const normalized = normalizeBookRequest({
      questionnaire: { hero_name: "Lina", age: 6, language: "fr" },
      photos: [
        { id: "lina.png", role: "child", story_role: "hero", name: "Lina" },
        { id: `${storyRole}.png`, role: "family", story_role: storyRole, relationship: "frère", name: "Nino" },
      ],
    });
    assert.equal(normalized.photos[1].story_role, storyRole);
  }
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
  assert.ok(UNIVERSE_OPTIONS.every((option) => option.prompt && option.palette.length === 3 && option.previewImage && option.referenceImage && option.storyContract));
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
    structuredSceneContract: {
      main_action: { subject: "Noa", verb: "montre une branche", target: "Pixel" },
      generic_characters: [{ id: "new_friend_1", description: "un nouvel enfant", must_not_resemble: ["Pixel"] }],
      required_elements: [{ description: "grande branche brillante", quantity: "1", scale: "longue comme le bras de Noa" }],
      forbidden_elements: ["Pixel ne remplace pas le nouvel enfant"],
    },
  });
  assert.equal(continuity.referenceImages.length, 1);
  assert.match(continuity.referenceImages[0].path, /noa\.jpg$/);
  assert.equal(continuity.referenceImages[0].kind, "identity");
  assert.equal(continuity.referenceImages[0].normalizationMode, "full_and_face");
  assert.match(continuity.characterFingerprints.join(" "), /FIXED OUTFIT.*blue sweater/i);
  assert.match(continuity.characterFingerprints.join(" "), /red fox.*SPECIES LOCK/i);
  assert.match(continuity.sceneContract, /compact visual specification is authoritative/i);
  assert.doesNotMatch(continuity.sceneContract, /Noa montre une branche brillante/);
  assert.doesNotMatch(continuity.sceneContract, /STRUCTURED SCENE CONTRACT/);
  assert.equal(continuity.sceneFidelityContract.main_action.subject, "hero child");

  const prompt = buildFinalPrompt({
    prompt: "A new forest scene",
    characterFingerprints: continuity.characterFingerprints,
    referenceImages: continuity.referenceImages,
    sceneContract: continuity.sceneContract,
  });
  assert.match(prompt, /never change face, species.*Wardrobe.*current scene contract/i);
  assert.match(prompt, /private identity-only reference/i);
  assert.match(prompt, /MANDATORY VISIBLE CAST \(2\): hero child, original unbranded non-human fox animal companion 2/);
  assert.match(prompt, /NON-HUMAN CAST LOCK \(1\).*fox/i);
  assert.match(prompt, /Never substitute a human child/i);
  assert.doesNotMatch(prompt, /\bNoa\b|\bPixel\b/);
  assert.match(prompt, /Do not omit, merge, replace or transform/i);
  assert.match(prompt, /Reference photos may contain printed words, labels or commercial logos/i);

  const photorealPrompt = buildFinalPrompt({
    prompt: "A magical forest portrait",
    renderingMode: "photorealistic",
    likenessGoal: "maximum",
  });
  assert.match(photorealPrompt, /Photorealistic fairy-tale photography/i);
  assert.match(photorealPrompt, /never turn a person into a cartoon, doll, figurine or CGI/i);
  assert.match(photorealPrompt, /Identity fidelity target: maximum/i);

  const resumed = buildSceneContinuity({
    blueprint,
    characterCanons: [],
    castPresent: ["Noa"],
    scenePrompt: "Noa enters another room",
    continuityImageStorageKey: "previews/project/cover-image.png",
  });
  assert.equal(resumed.referenceImages[0].storageKey, "previews/project/cover-image.png");
  assert.equal(resumed.referenceImages[0].kind, "continuity");

  const interiorWithIdentity = buildSceneContinuity({
    blueprint,
    characterCanons: [{ name: "Noa", role: "child", photoId: "noa.jpg" }],
    castPresent: ["Noa"],
    scenePrompt: "Noa enters another room",
    continuityImageStorageKey: "previews/project/cover-image.png",
  });
  assert.equal(interiorWithIdentity.referenceImages[0].kind, "continuity");
  assert.equal(interiorWithIdentity.referenceImages[1].kind, "identity");
  assert.equal(interiorWithIdentity.referenceImages[1].normalizationMode, "face_focus");
  const interiorPrompt = buildFinalPrompt({
    prompt: "Noa enters another room",
    referenceImages: interiorWithIdentity.referenceImages,
  });
  assert.match(interiorPrompt, /Reference 1 \[PRIMARY APPROVED STYLE ANCHOR\]/);
  assert.match(interiorPrompt, /Reference 2 \[IDENTITY ONLY\]/);
  assert.match(interiorPrompt, /IDENTITY ONLY references preserve stable facial or animal traits only/i);
});

test("approved cover visual bible locks one private style anchor without changing existing previews", () => {
  const project = {
    questionnaire: { style_id: "soft_watercolor" },
    previewResult: {
      coverImageStorageKey: "previews/project/approved-cover.png",
    },
  };
  const lockedAt = "2026-07-31T14:00:00.000Z";
  const bible = createApprovedCoverVisualBible(project, lockedAt);
  assert.deepEqual(bible, {
    version: 1,
    status: "locked",
    lockedAt,
    coverImageStorageKey: "previews/project/approved-cover.png",
    styleId: "soft_watercolor",
    renderingMode: "illustrated_faithful",
    likenessGoal: "strong",
    referencePolicy: APPROVED_COVER_REFERENCE_POLICY,
  });
  assert.equal(visualBibleCoverStorageKey({
    ...project,
    continuitySnapshot: { visualBible: bible },
  }), "previews/project/approved-cover.png");
  assert.equal(createApprovedCoverVisualBible({ previewResult: {} }, lockedAt), null);

  assert.deepEqual(
    prioritizeVisualReferences([
      { kind: "identity", label: "person 1" },
      { kind: "continuity", label: "approved cover" },
      { kind: "identity", label: "person 2" },
    ]).map((reference) => reference.kind),
    ["continuity", "identity", "identity"],
  );
});

test("visual aliases preserve distinct non-human species for multiple animal companions", () => {
  const aliases = buildImageCharacterAliases({
    blueprint: {
      hero: { name: "Malvina", role: "child" },
      cast: [
        { name: "Lua", role: "mascot", canon_short: "petite chienne brune avec de longues oreilles" },
        { name: "Nube", role: "mascot", canon_short: "renard blanc avec une queue touffue" },
      ],
    },
    castPresent: ["Malvina", "Lua", "Nube"],
  });
  assert.deepEqual(aliases.map(({ alias, entity_type, species }) => ({ alias, entity_type, species })), [
    { alias: "hero child", entity_type: "human", species: "" },
    { alias: "original unbranded non-human dog animal companion 2", entity_type: "animal", species: "dog" },
    { alias: "original unbranded non-human fox animal companion 3", entity_type: "animal", species: "fox" },
  ]);
});

test("family roles stay human even when their visual description mentions animals", () => {
  const aliases = buildImageCharacterAliases({
    blueprint: {
      hero: { name: "Tyam", role: "child" },
      cast: [
        { name: "Santi", role: "family", relationship: "frère", canon_short: "jeune garçon avec un t-shirt montrant un renard" },
        { name: "Malvina", role: "other", relationship: "hermana", canon_short: "niña qui adore les animaux et porte un pendentif ours" },
      ],
    },
    castPresent: ["Tyam", "Santi", "Malvina"],
  });
  assert.deepEqual(aliases.map(({ alias, entity_type, species }) => ({ alias, entity_type, species })), [
    { alias: "hero child", entity_type: "human", species: "" },
    { alias: "family member 2", entity_type: "human", species: "" },
    { alias: "family member 3", entity_type: "human", species: "" },
  ]);
});

test("photo-upload names are immutable canon throughout blueprint and manuscript", () => {
  const blueprint = {
    hero: { name: "Nolan", outfit_lock: "red jacket" },
    cast: [{ name: "Mathieu", role: "family", canon_short: "grand frere" }],
    cover: { title: "Nolan", image_prompt: "Nolan et Mathieu", cast_present: ["Nolan", "Mathieu"] },
    pages: createPagePlan(24).map((page) => ({
      ...page,
      text_prompt: page.page_type.includes("text") ? "Nolan avance avec Mathieu." : "",
      image_prompt: page.page_type === "image" ? "Nolan avance avec Mathieu." : "",
      cast_present: page.page_type === "image" ? ["Nolan", "Mathieu"] : [],
    })),
  };
  const characterCanons = [
    { name: "Nolan", role: "child", outfit_lock: "red jacket" },
    { name: "Mathéo", role: "family", relationship: "frère", canon_short: "grand frère de Nolan" },
  ];
  const result = lockBlueprintContinuity(blueprint, { language: "FR", pageCount: 24, characterCanons });
  assert.equal(result.cast.filter((character) => character.name === "Mathéo").length, 1);
  assert.equal(result.cast.some((character) => character.name === "Mathieu"), false);
  assert.match(result.cover.image_prompt, /Mathéo/);
  assert.doesNotMatch(result.cover.image_prompt, /Mathieu/);
  assert.equal(canonicalizeWrittenNames("Mathieu donne la main à Nolan.", characterCanons), "Mathéo donne la main à Nolan.");
});

test("structured scene prompt preserves action roles, generic people, quantities and scale", () => {
  const prompt = sceneContractImagePrompt({
    contract: {
      story_beat: "Nolan rencontre un nouveau camarade près des grands toboggans",
      main_action: { subject: "Nolan", verb: "serre la main de", target: "new_friend_1" },
      named_characters: [{ name: "Mathéo", visual_role: "observer", action: "reste derrière Nolan" }],
      generic_characters: [{ id: "new_friend_1", description: "enfant inconnu avec un pull vert", action: "serre la main de Nolan", must_not_resemble: ["Mathéo"] }],
      required_elements: [{ description: "toboggans", quantity: "3", scale: "très grands" }],
      spatial_relationships: ["Mathéo observe derrière Nolan"],
      forbidden_elements: ["Mathéo ne serre pas la main de Nolan"],
    },
    stylePrompt: "gouache douce",
  });
  assert.match(prompt, /hero child serre la main de new_friend_1/);
  assert.match(prompt, /must remain visually distinct from recurring story companion 1/);
  assert.match(prompt, /quantity: 3; scale: très grands/);
  assert.match(prompt, /recurring story companion 1 ne serre pas la main/);
  assert.doesNotMatch(prompt, /\bNolan\b|\bMathéo\b/);
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
  assert.match(continuity.sceneContract, /MANDATORY INDIVIDUAL UNDERWATER SAFETY \(2 people: hero child, family member 2\)/);
  assert.match(continuity.sceneContract, /every other submerged person must have their own complete appropriate mechanism/i);
  assert.match(continuity.sceneContract, /No listed person may appear bare-headed/i);
});

test("a breathable render snapshot overrides underwater prose and removes stored breathing gear from wardrobe", () => {
  const continuity = buildSceneContinuity({
    blueprint: {
      hero: {
        name: "Bastien",
        outfit_lock: "a turquoise wetsuit with reef shoes and the story-established breathing mechanism",
      },
      cast: [],
    },
    castPresent: ["Bastien"],
    scenePrompt: "L'eau chante autour de la combinaison avant le retour à l'atelier.",
    pairedText: "Bastien revient de l'océan et range sa bulle dans l'atelier.",
    structuredSceneContract: {
      named_characters: [{ name: "Bastien", action: "regarde son dessin" }],
      main_action: { subject: "Bastien", verb: "regarde", target: "son dessin" },
      required_elements: [], object_states: [], spatial_relationships: [], forbidden_elements: [],
      render_snapshot: {
        physical_medium: "breathable_air",
        location: "atelier de dessin",
        equipment: [{ name: "breathing_and_voice_bubble", owner: "Bastien", state: "stored", quantity: 1 }],
        forbidden: ["Bastien's bubble is stored and not worn."],
      },
    },
  });

  assert.doesNotMatch(continuity.characterFingerprints.join(" "), /breathing mechanism/u);
  assert.doesNotMatch(continuity.sceneContract, /MANDATORY INDIVIDUAL UNDERWATER SAFETY/u);
  assert.match(continuity.sceneContract, /VISIBLE PHYSICAL MEDIUM: breathable_air/u);
  assert.match(continuity.sceneContract, /stored and not worn/u);
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

test("approved wardrobe changes only from its declared scenario scene", () => {
  const blueprint = {
    hero: { name: "Nolan", outfit_lock: "" },
    cast: [],
    cover: { image_prompt: "Nolan explores the coral ocean", cast_present: ["Nolan"] },
    pages: createPagePlan(24).map((page) => ({
      ...page,
      text_prompt: page.page_type === "image" ? "" : "text",
      image_prompt: page.page_type === "image" ? "Nolan advances" : "",
      cast_present: page.page_type === "image" ? ["Nolan"] : [],
    })),
  };
  const photoOutfit = "grey t-shirt, red shorts and plain shoes";
  const adventureOutfit = "turquoise wetsuit, reef shoes and transparent breathing bubble";
  const result = lockBlueprintContinuity(blueprint, {
    language: "EN",
    pageCount: 24,
    characterCanons: [{
      name: "Nolan",
      role: "child",
      outfit_lock: photoOutfit,
      outfit_contract: adventureOutfit,
    }],
    approvedScenario: {
      wardrobePlan: [{
        characterName: "Nolan",
        preference: "selected",
        adventureDescription: adventureOutfit,
        activationSceneNumber: 3,
      }],
    },
  });
  const sceneTwo = result.pages.find((page) => page.page_type === "image" && page.scene_number === 2);
  const sceneThree = result.pages.find((page) => page.page_type === "image" && page.scene_number === 3);
  assert.equal(result.hero.outfit_lock, photoOutfit);
  assert.equal(result.hero.ordinary_outfit_lock, photoOutfit);
  assert.equal(result.hero.adventure_outfit_lock, adventureOutfit);
  assert.deepEqual(result.wardrobe_authority, {
    version: 1,
    mode: "dual_state",
    characters: [{
      name: "Nolan",
      ordinary_outfit: photoOutfit,
      adventure_outfit: adventureOutfit,
    }],
  });
  assert.equal(sceneTwo.wardrobe_locks[0].outfit, photoOutfit);
  assert.equal(sceneThree.wardrobe_locks[0].outfit, adventureOutfit);
  assert.equal(result.cover.wardrobe_locks[0].outfit, adventureOutfit);

  const preserved = lockBlueprintContinuity(blueprint, {
    language: "EN",
    pageCount: 24,
    characterCanons: [{
      name: "Nolan",
      role: "child",
      outfit_lock: photoOutfit,
      outfit_contract: "the generic clothing visible in the private reference",
      outfit_selection_explicit: false,
    }],
    approvedScenario: {
      wardrobePlan: [{
        characterName: "Nolan",
        preference: "preserve_photo",
        adventureDescription: "the generic clothing visible in the private reference",
        activationSceneNumber: 1,
      }],
    },
  });
  assert.equal(preserved.hero.outfit_lock, photoOutfit);
  assert.equal(preserved.cover.wardrobe_locks[0].outfit, photoOutfit);
});

test("a departure witness who never travels keeps ordinary clothing", () => {
  const plan = createPagePlan(24);
  const blueprint = {
    hero: { name: "Noa", outfit_lock: "ordinary green dress" },
    cast: [{ name: "Papa", role: "family", outfit_lock: "ordinary navy shirt" }],
    cover: { image_prompt: "Noa and Papa at the launch pad", cast_present: ["Noa", "Papa"] },
    pages: plan.map((page) => ({
      ...page,
      text_prompt: page.page_type === "image" ? "" : "text",
      image_prompt: page.page_type === "image" ? "Noa and Papa at departure" : "",
      cast_present: page.page_type === "image" ? ["Noa", "Papa"] : [],
    })),
  };
  const result = lockBlueprintContinuity(blueprint, {
    language: "EN",
    pageCount: 24,
    characterCanons: [
      { name: "Noa", role: "child", outfit_lock: "ordinary green dress", outfit_contract: "silver space suit" },
      { name: "Papa", role: "family", outfit_lock: "ordinary navy shirt", outfit_contract: "silver space suit" },
    ],
    approvedScenario: {
      wardrobePlan: [
        { characterName: "Noa", preference: "selected", adventureDescription: "silver space suit", activationSceneNumber: 1 },
        { characterName: "Papa", preference: "selected", adventureDescription: "silver space suit", activationSceneNumber: 1 },
      ],
      scenes: [{
        sceneNumber: 1,
        transition: { kind: "ordinary_travel", characters: ["Noa"] },
        characterMovements: [{ kind: "ordinary_travel", characters: ["Noa"] }],
      }],
    },
  });
  const departure = result.pages.find((page) => page.page_type === "image" && page.scene_number === 1);
  assert.equal(departure.wardrobe_locks.find((item) => item.name === "Noa").outfit, "silver space suit");
  assert.equal(departure.wardrobe_locks.find((item) => item.name === "Papa").outfit, "ordinary navy shirt");
  assert.equal(result.cover.wardrobe_locks.find((item) => item.name === "Papa").outfit, "ordinary navy shirt");
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
  const [source, app, html] = await Promise.all([
    fs.readFile("src/routes/preview.js", "utf8"),
    fs.readFile("public/app.js", "utf8"),
    fs.readFile("public/index.html", "utf8"),
  ]);
  const repairStep = source.indexOf('"qa:repair"');
  const coverStep = source.indexOf('step: "draft:cover"');
  assert.ok(repairStep >= 0);
  assert.ok(coverStep > repairStep);
  assert.match(source, /blueprintRepairAgent/);
  assert.match(source, /qa:verify_repair/);
  assert.match(source, /maximumRepairAttempts = 3/);
  const textStep = source.indexOf("draft:manuscript:act:");
  assert.ok(textStep >= 0);
  assert.ok(textStep < coverStep);
  assert.match(source, /manuscriptWriterAgent/);
  assert.match(source, /manuscriptEditorAgent/);
  assert.match(source, /pairedText,/);
  const proofStep = source.indexOf('status: "awaiting_visual_approval"');
  const interiorLoop = source.indexOf("for (const page of final_blueprint.pages)");
  assert.ok(proofStep > coverStep);
  assert.ok(interiorLoop > proofStep);
  assert.match(source, /visualProofAction === "approve"/);
  assert.match(source, /visualProofAction === "regenerate"/);
  assert.match(source, /storyScenePlanAuditAgent/);
  assert.match(source, /story:scenario-fidelity-repair/);
  assert.match(source, /story:scenario-fidelity-targeted-repair/);
  assert.match(source, /story:scenario-fidelity-targeted-recheck/);
  assert.match(source, /backgroundStep:\s*`planner:targeted:v\$\{STORY_PLAN_TARGETED_REPAIR_VERSION\}`/);
  assert.match(source, /storySceneTextRepairAgent/);
  assert.match(source, /story:scenario-fidelity-targeted-text-repair/);
  assert.match(source, /backgroundStep:\s*`writer:targeted:v\$\{STORY_PLAN_TEXT_REPAIR_VERSION\}`/);
  assert.match(source, /story:scenario-fidelity-targeted-text-recheck/);
  assert.match(source, /phase:\s*"story-plan:targeted-text-candidate"/);
  assert.match(source, /candidateStage = "targeted-plan"/);
  assert.match(source, /storyScenePlanCandidateRepairVersion/);
  assert.match(source, /storyScenePlanCandidate/);
  assert.match(source, /compileStoryPlan/);
  assert.match(source, /applyLocalCompilerIssues/);
  assert.match(source, /modelRetryAvoided/);
  assert.match(source, /storyPlanProviderResponses/);
  assert.match(source, /backgroundStep:\s*`blueprint:v\$\{BLUEPRINT_CONTRACT_VERSION\}`/);
  assert.match(source, /backgroundExecution:\s*providerBackgroundExecution/);
  assert.match(source, /backgroundStep:\s*`blueprint:qa:v\$\{BLUEPRINT_CONTRACT_VERSION\}:initial`/);
  assert.match(source, /backgroundStep:\s*`blueprint:repair:v\$\{BLUEPRINT_CONTRACT_VERSION\}:attempt:\$\{repairAttempt\}`/);
  assert.match(source, /backgroundStep:\s*`blueprint:qa:v\$\{BLUEPRINT_CONTRACT_VERSION\}:verify:\$\{repairAttempt\}`/);
  assert.match(source, /classifiedError\?\.code === "preview_interrupted"/);
  assert.match(source, /preview_provider_billing_unavailable/);
  assert.match(source, /story:scenario-fidelity-resume/);
  assert.match(source, /backgroundStep:\s*`planner:\$\{attempt\}`/);
  assert.match(source, /if \(!hasCurrentStoryScenePlan\)/);
  assert.match(source, /event: "cover_ready"/);
  assert.match(source, /event: "generation_failed"/);
  assert.match(source, /milestoneEventIds/);
  assert.match(source, /quality: "medium"/);
  assert.match(app, /awaiting_visual_approval/);
  assert.match(app, /showVisualProof/);
  assert.match(app, /COUVERTURE EN PR/);
  assert.match(app, /vous devrez valider cette couverture/);
  assert.match(html, /id="visualProofPanel"/);
  assert.match(html, /id="approveVisualProofButton"/);
  assert.match(html, /id="generationNextStep"/);
});

test("whole-book planner and audit use bounded resumable story execution", async () => {
  const [planner, audit, prompt] = await Promise.all([
    fs.readFile("src/agents/storyScenePlanner.js", "utf8"),
    fs.readFile("src/agents/storyScenePlanAudit.js", "utf8"),
    fs.readFile("src/prompts/story_scene_planner.txt", "utf8"),
  ]);
  for (const source of [planner, audit]) {
    assert.match(source, /backgroundExecution/);
    assert.match(source, /backgroundStep/);
    assert.match(source, /clientKind:\s*"story"/);
  }
  assert.doesNotMatch(audit, /clientKind:\s*"qa"/);
  assert.match(audit, /source:\s*"deterministic"/);
  assert.match(audit, /modelRole = "story_auditor"/);
  assert.match(audit, /modelRole,/);
  assert.ok(audit.indexOf("const deterministicIssues") < audit.indexOf("const result = await runAgent"));
  assert.match(prompt, /changing prose alone is not a repair/i);
  assert.match(prompt, /approved symbolic representation/i);
  assert.match(prompt, /One scene contract shows one instant only/i);
  assert.match(prompt, /speech_segments/i);
  assert.match(prompt, /canonical speaker, mode and exact words/i);
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
  assert.match(cssSource, /\.reader-page img[^}]*object-fit: contain/);
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
    const source = await fs.readFile("src/services/createEbookPdf.js", "utf8");
    assert.match(source, /embedJpg/);
    assert.doesNotMatch(source, /embedPng/);
  } finally {
    await fs.rm(outputsDir, { recursive: true, force: true });
  }
});

test("ebook reading order is text then illustration independently from print sides", () => {
  const previewUrl = (page) => `/outputs/page-${page}.png`;
  const pages = [
    { page_number: 5, page_type: "text", spread_number: 2, previewUrl: previewUrl(5) },
    { page_number: 4, page_type: "image", spread_number: 2, previewUrl: previewUrl(4) },
    { page_number: 3, page_type: "image", spread_number: 1, previewUrl: previewUrl(3) },
    { page_number: 2, page_type: "text", spread_number: 1, previewUrl: previewUrl(2) },
    { page_number: 1, page_type: "opening_text", spread_number: null, previewUrl: previewUrl(1) },
    { page_number: 6, page_type: "closing_text", spread_number: null, previewUrl: previewUrl(6) },
  ];
  assert.deepEqual(orderEbookPages(pages).map((page) => page.page_number), [1, 2, 3, 5, 4, 6]);
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
