import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

import { applyPagePlan } from "../src/config/bookStructure.js";
import { BOOK_FORMATS, availableBookFormats } from "../src/config/bookFormats.js";
import {
  createBookProductContract,
  existingBookProductContract,
} from "../src/services/bookProductContract.js";
import { composeBookPagePNG } from "../src/services/composeBookPagePNG.js";
import { createEbookPdfBuffer } from "../src/services/createEbookPdf.js";
import { signBookOrderWebhook, verifyBookOrderWebhook } from "../src/services/commerceToken.js";

const enabled = { BOOK_FORMAT_V1_ENABLED: "true" };
const disabled = { BOOK_FORMAT_V1_ENABLED: "false" };

test("format V1 exposes three exact trims only after rollout is enabled", () => {
  assert.deepEqual(availableBookFormats(disabled).map(({ id }) => id), ["square_21"]);
  assert.deepEqual(availableBookFormats(enabled).map(({ id }) => id), [
    "square_21",
    "portrait_17x24",
    "portrait_21x29_7",
  ]);
  assert.deepEqual(BOOK_FORMATS.map(({ widthMm, heightMm }) => [widthMm, heightMm]), [
    [210, 210],
    [170, 240],
    [210, 297],
  ]);
});

test("new V1 ebooks lock 0.37 EUR TTC per page and the selected format", () => {
  const contract = createBookProductContract({
    requested: { page_count: 32, product_type: "ebook", book_format_id: "portrait_17x24" },
    env: enabled,
  });
  assert.equal(contract.bookFormatId, "portrait_17x24");
  assert.equal(contract.pricingVersion, "digital_ttc_037_v1");
  assert.equal(contract.unitPagePriceEur, 0.37);
  assert.equal(contract.priceEur, 11.84);
  assert.equal(contract.generationPriceEur, 5.92);
  assert.equal(contract.generationUnitPagePriceEur, 0.185);
  assert.equal(contract.interactiveReaderIncluded, false);
  assert.equal(contract.temporaryInteractivePreviewIncluded, true);
  assert.equal(contract.previewAccessDurationHours, 72);
  assert.equal(contract.purchaseCreditCents, 592);
  assert.equal(contract.permanentDigitalPurchaseIncludesInteractiveReader, true);
  assert.equal(contract.permanentDigitalPurchaseIncludesPdf, true);
  assert.equal(contract.ebookIncludedInGeneration, false);
  assert.equal(contract.wooVariationKey, "ebook_portrait-17x24_32_digital_ttc_037_v1");
});

test("existing projects without the new fields remain historical square books", () => {
  const contract = existingBookProductContract({
    questionnaire: { page_count: 24, product_type: "ebook" },
  });
  assert.equal(contract.bookFormatId, "square_21");
  assert.equal(contract.pricingVersion, "digital_legacy_v1");
  assert.equal(contract.priceEur, 6.69);
  assert.equal(contract.generationPriceEur, 2.5);
  assert.equal(contract.generationUnitPagePriceEur, null);
});

test("a locked product contract cannot be replaced by a later client payload", () => {
  const existing = existingBookProductContract({
    questionnaire: {
      page_count: 28,
      product_type: "ebook",
      book_format_id: "portrait_21x29_7",
      pricing_version: "digital_ttc_037_v1",
    },
  });
  assert.equal(existing.priceEur, 10.36);
  assert.deepEqual(
    createBookProductContract({
      requested: { page_count: 28, product_type: "ebook", book_format_id: "portrait_21x29_7" },
      env: disabled,
    }).bookFormatId,
    "square_21",
  );
});

test("page-plan, PNG and PDF dimensions follow the chosen portrait trim", async () => {
  const blueprint = applyPagePlan({ pages: [] }, 24, "portrait_17x24");
  assert.equal(blueprint.format.width_mm, 170);
  assert.equal(blueprint.format.height_mm, 240);

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-format-test-"));
  try {
    const source = await sharp({ create: { width: 30, height: 30, channels: 3, background: "#447788" } }).png().toBuffer();
    const imageUrl = `data:image/png;base64,${source.toString("base64")}`;
    const outputUrl = await composeBookPagePNG({
      baseUrl: "https://example.test",
      imageUrl,
      outName: "portrait-cover",
      pageType: "cover",
      title: "Un titre sans cartouche",
      bookFormat: blueprint.format,
      dpi: 25.4,
      outputsDir: directory,
    });
    const metadata = await sharp(path.join(directory, path.basename(outputUrl))).metadata();
    assert.equal(metadata.width, 170);
    assert.equal(metadata.height, 240);

    const pdfBytes = await createEbookPdfBuffer({
      coverPreviewUrl: imageUrl,
      bookFormat: blueprint.format,
      loadAsset: async () => source,
    });
    const pdf = await PDFDocument.load(pdfBytes);
    const [page] = pdf.getPages();
    assert.ok(Math.abs(page.getWidth() - (170 / 25.4) * 72) < 0.01);
    assert.ok(Math.abs(page.getHeight() - (240 / 25.4) * 72) < 0.01);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("Bridge 0.8.1 requires the exact format, pages and pricing version", async () => {
  const source = await fs.readFile("wordpress/calitiki-bridge/calitiki-bridge.php", "utf8");
  assert.match(source, /Version: 0\.8\.1/);
  assert.match(source, /variation_for_configuration/);
  assert.match(source, /digital_ttc_037_v1/);
  assert.match(source, /portrait_21x29_7/);
  assert.match(source, /Format du livre/);
});

test("the model-facing intake cannot reinterpret the locked format", async () => {
  const source = await fs.readFile("src/agents/intake.js", "utf8");
  assert.match(source, /result\.intake\.book_format_id = rawAnswers\?\.book_format_id/);
  assert.match(source, /result\.intake\.pricing_version = rawAnswers\?\.pricing_version/);
});

test("the commerce signature binds format and pricing version", () => {
  const secret = "b".repeat(64);
  const payload = {
    orderId: "42",
    customerId: "7",
    projectId: "project-1",
    reservationId: "reservation-1",
    productType: "ebook",
    pageCount: 32,
    orderTotalCents: 1184,
    status: "paid",
    bookFormatId: "portrait_17x24",
    pricingVersion: "digital_ttc_037_v1",
  };
  const signature = signBookOrderWebhook(payload, secret);
  assert.equal(verifyBookOrderWebhook({ ...payload, signature }, secret), true);
  assert.equal(verifyBookOrderWebhook({ ...payload, bookFormatId: "square_21", signature }, secret), false);
  assert.equal(verifyBookOrderWebhook({ ...payload, pricingVersion: "digital_legacy_v1", signature }, secret), false);
});
