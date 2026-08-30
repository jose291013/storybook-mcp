import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  isPreviewGenerationStage,
  previewGenerationStage,
} from "../src/services/previewGenerationStage.js";

test("an approved cover resumes directly on interior illustrations", () => {
  assert.equal(previewGenerationStage({ visualProofStatus: "approved" }), "interior");
  assert.equal(previewGenerationStage({ visualProofStatus: "approved", visualProofAction: "" }), "interior");
});

test("cover approval and regeneration actions expose their exact next stage", () => {
  assert.equal(previewGenerationStage({ visualProofStatus: "awaiting_approval", visualProofAction: "approve" }), "interior");
  assert.equal(previewGenerationStage({ visualProofStatus: "awaiting_approval", visualProofAction: "regenerate" }), "regenerate");
  assert.equal(previewGenerationStage({ visualProofStatus: "regenerating" }), "regenerate");
  assert.equal(previewGenerationStage({ visualProofStatus: "awaiting_approval" }), "cover");
});

test("the preview route returns the authoritative stage and the client obeys it", async () => {
  const [route, app] = await Promise.all([
    fs.readFile("src/routes/preview.js", "utf8"),
    fs.readFile("public/app.js", "utf8"),
  ]);

  assert.match(route, /generationStage: previewGenerationStage/);
  assert.match(app, /includes\(payload\.generationStage\)/);
  assert.match(app, /showGenerationPanel\(generationStage, payload\.repairQueue \|\| null\)/);
  assert.equal(isPreviewGenerationStage("interior"), true);
  assert.equal(isPreviewGenerationStage("unknown"), false);
});
