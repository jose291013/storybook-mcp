import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("Sharp stays pinned to the patched libvips release line", async () => {
  const [packageJson, packageLock] = await Promise.all([
    fs.readFile("package.json", "utf8").then(JSON.parse),
    fs.readFile("package-lock.json", "utf8").then(JSON.parse),
  ]);

  assert.equal(packageJson.dependencies.sharp, "0.35.3");
  assert.equal(packageLock.packages?.["node_modules/sharp"]?.version, "0.35.3");
});
