import assert from "node:assert/strict";
import test from "node:test";
import { interactiveReaderInstallManifest } from "../src/services/interactiveReaderInstallManifest.js";

test("the installed reader start URL keeps the private book id without carrying credentials", () => {
  const manifest = interactiveReaderInstallManifest({ projectId: "project-291013", language: "es-ES" });
  const start = new URL(manifest.start_url, "https://storybook.example/interactive-reader/");

  assert.equal(manifest.lang, "es");
  assert.equal(start.searchParams.get("project"), "project-291013");
  assert.equal(start.searchParams.get("source"), "installed");
  assert.equal(start.searchParams.has("token"), false);
  assert.equal(start.searchParams.has("state"), false);
});

test("an invalid project id cannot be embedded in an install manifest", () => {
  const manifest = interactiveReaderInstallManifest({ projectId: "../../private", language: "unknown" });
  const start = new URL(manifest.start_url, "https://storybook.example/interactive-reader/");

  assert.equal(manifest.lang, "fr");
  assert.equal(start.searchParams.has("project"), false);
});
