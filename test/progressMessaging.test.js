import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

test("automatic and creator-requested illustration repairs have honest localized messages", async () => {
  const [app, i18n] = await Promise.all([
    fs.readFile("public/app.js", "utf8"),
    fs.readFile("public/i18n.js", "utf8"),
  ]);
  assert.match(app, /quality:repair:page[\s\S]*progressQualityRepair/);
  assert.match(app, /draft:repair:page[\s\S]*progressAutomaticQualityRepair/);
  assert.match(i18n, /progressAutomaticQualityRepair: "Calitiki corrige automatiquement/);
  assert.match(i18n, /progressAutomaticQualityRepair: "Calitiki corrige automáticamente/);
  assert.match(i18n, /progressAutomaticQualityRepair: "Calitiki is automatically correcting/);
});
