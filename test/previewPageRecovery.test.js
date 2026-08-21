import test from "node:test";
import assert from "node:assert/strict";
import {
  isStrictV3AcceptedImagePage,
  partitionPreviewDraftPages,
  strictPageIssueCodes,
  upsertPreviewDraftPage,
} from "../src/services/previewPageRecovery.js";

function page(pageNumber, overrides = {}) {
  return {
    page_number: pageNumber,
    page_type: "image",
    storageKey: `private/layout-${pageNumber}`,
    previewUrl: `/private/layout-${pageNumber}`,
    imageStorageKey: `private/image-${pageNumber}`,
    ...overrides,
  };
}

test("strict V3 resumes every private non-accepted image and reuses only proven pages", () => {
  const textPage = page(2, { page_type: "text", imageStorageKey: "" });
  const accepted = page(3, { qualityStatus: "strict_accepted", strictEvidenceVersion: 2 });
  const repaired = page(5, { qualityStatus: "accepted_after_repair", strictEvidenceVersion: 2 });
  const quarantined = page(7, { qualityStatus: "strict_quarantined" });
  const legacyAccepted = page(9, { qualityStatus: "accepted" });
  const result = partitionPreviewDraftPages([
    textPage,
    accepted,
    repaired,
    quarantined,
    legacyAccepted,
  ], { strictV3Rendering: true });

  assert.deepEqual(result.acceptedPages.map((item) => item.page_number), [2, 3, 5]);
  assert.deepEqual(result.recoveryPageNumbers, [7, 9]);
  assert.equal(isStrictV3AcceptedImagePage(accepted), true);
  assert.equal(isStrictV3AcceptedImagePage(quarantined), false);
});

test("legacy preview behavior keeps every reusable page", () => {
  const pages = [page(3, { qualityStatus: "review_required" }), page(5)];
  const result = partitionPreviewDraftPages(pages, { strictV3Rendering: false });
  assert.deepEqual(result.acceptedPages, pages);
  assert.deepEqual(result.recoveryPageNumbers, []);
});

test("one regenerated page replaces its private predecessor instead of duplicating it", () => {
  const pages = [page(3), page(5, { qualityStatus: "strict_quarantined" })];
  const replacement = page(5, { qualityStatus: "strict_accepted", strictEvidenceVersion: 2 });
  upsertPreviewDraftPage(pages, replacement);
  assert.equal(pages.length, 2);
  assert.equal(pages.filter((item) => item.page_number === 5).length, 1);
  assert.equal(pages[1], replacement);
});

test("strict issue diagnostics fall through empty targeted scopes to exact domain codes", () => {
  const codes = strictPageIssueCodes({
    qualityIssueCodes: [],
    qualityRepairPolicy: {
      remainingIssueCodes: [],
      targetCodes: [],
      classifications: [
        { code: "wardrobe_state_mismatch" },
        { code: "style_continuity_mismatch" },
      ],
    },
  });
  assert.deepEqual(codes, ["wardrobe_state_mismatch", "style_continuity_mismatch"]);
});
