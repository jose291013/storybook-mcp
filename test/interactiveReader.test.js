import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  createReaderState,
  goToNextScene,
  goToPreviousScene,
  revealScene,
  setTextVisibility,
} from "../public/interactive-reader/reader-state.js";

test("interactive reader requires illustration discovery before advancing", () => {
  const initial = createReaderState(3);
  assert.equal(initial.phase, "anticipation");
  assert.deepEqual(goToNextScene(initial), initial);

  const revealed = revealScene(initial);
  assert.equal(revealed.phase, "revealed");

  const secondScene = goToNextScene(revealed);
  assert.equal(secondScene.sceneIndex, 1);
  assert.equal(secondScene.phase, "anticipation");
});

test("interactive reader restores a previously discovered scene and completes after the last one", () => {
  let state = createReaderState(2);
  state = goToNextScene(revealScene(state));
  assert.equal(state.sceneIndex, 1);
  assert.equal(goToPreviousScene(state).phase, "revealed");

  state = revealScene(state);
  state = setTextVisibility(state, false);
  assert.equal(state.textVisible, false);
  assert.equal(goToNextScene(state).phase, "complete");
});

test("interactive reader is an isolated installable PWA with the approved navigation", async () => {
  const [html, app, styles, manifest, worker, book] = await Promise.all([
    fs.readFile("public/interactive-reader/index.html", "utf8"),
    fs.readFile("public/interactive-reader/app.js", "utf8"),
    fs.readFile("public/interactive-reader/styles.css", "utf8"),
    fs.readFile("public/interactive-reader/manifest.webmanifest", "utf8"),
    fs.readFile("public/interactive-reader/sw.js", "utf8"),
    fs.readFile("public/interactive-reader/demo-book.json", "utf8"),
  ]);

  assert.match(html, /data-top-back/);
  assert.match(html, /data-reveal/);
  assert.match(html, /data-text-toggle/);
  assert.match(html, /scene-navigation/);
  assert.match(app, /voiceschanged/);
  assert.match(app, /Aucune voix française ne répond/);
  assert.match(styles, /background: rgba\(9,45,49,\.6\)/);
  assert.equal(JSON.parse(manifest).display, "standalone");
  assert.match(worker, /calitiki-interactive-demo-v2/);
  assert.equal(JSON.parse(book).scenes.length, 3);
});
