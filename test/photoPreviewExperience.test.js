import fs from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("participant previews show the full image and open an accessible local lightbox", async () => {
  const [app, styles] = await Promise.all([
    fs.readFile("public/app.js", "utf8"),
    fs.readFile("public/styles.css", "utf8"),
  ]);
  assert.match(styles, /\.photo-item > img[^}]*object-fit: contain/);
  assert.match(styles, /\.photo-lightbox/);
  assert.match(styles, /\.photo-lightbox::backdrop/);
  assert.match(app, /dialog\.showModal\(\)/);
  assert.match(app, /previewImage\.addEventListener\("keydown"/);
  assert.match(app, /event\.key === "Enter" \|\| event\.key === " "/);
});
