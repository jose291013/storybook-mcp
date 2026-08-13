import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { UI_TEXT } from "../public/i18n.js";

test("email project resume is explicit, account-bound and independent from browser draft state", async () => {
  const [html, css, app, authRoute, identity, notification, bridge] = await Promise.all([
    fs.readFile("public/index.html", "utf8"),
    fs.readFile("public/styles.css", "utf8"),
    fs.readFile("public/app.js", "utf8"),
    fs.readFile("src/routes/woocommerceAuth.js", "utf8"),
    fs.readFile("src/services/draftIdentity.js", "utf8"),
    fs.readFile("src/services/previewNotification.js", "utf8"),
    fs.readFile("wordpress/calitiki-bridge/calitiki-bridge.php", "utf8"),
  ]);

  assert.match(notification, /\?resumeProject=\$\{encodeURIComponent\(project\.id\)\}#project-resume/);
  assert.match(html, /id="projectResumePanel"[\s\S]*id="projectResumeLogin"[\s\S]*id="projectResumeCreations"/);
  assert.match(css, /\.project-resume-panel/);
  assert.match(identity, /"project_resume"/);
  assert.match(authRoute, /destination: "project_resume"/);
  assert.match(authRoute, /params\.set\("resume", "project"\)/);
  assert.match(authRoute, /#project-resume/);
  assert.match(app, /projectResumeIdFromUrl/);
  assert.match(app, /if \(!state\.customerSession\?\.authenticated\)[\s\S]*resumeProjectLoginStatus/);
  assert.match(app, /state\.projectId = projectId;[\s\S]*restoreCompletedPreview\(\)/);
  assert.match(app, /window\.location\.assign\(`\/api\/auth\/woocommerce\/project\?projectId=/);
  assert.match(app, /if \(state\.resumeProjectId\) await resumeProjectFromEntry\(\)/);
  assert.doesNotMatch(app, /resumeProjectFromEntry[\s\S]{0,700}readLocalDraft/);
  assert.match(bridge, /private static function creator_bridge_url[\s\S]*'destination' => 'project_resume'/);
  assert.doesNotMatch(bridge, /private static function creator_bridge_url[\s\S]{0,800}'destination' => 'creator'/);

  for (const locale of ["FR", "ES", "EN"]) {
    for (const key of [
      "resumeProjectKicker", "resumeProjectTitle", "resumeProjectLead",
      "resumeProjectLoginStatus", "resumeProjectLoginAction", "resumeProjectConnecting",
      "resumeProjectLoading", "resumeProjectAccessError", "resumeProjectCreations", "resumeProjectSecurity",
    ]) {
      assert.ok(UI_TEXT[locale][key], `${locale}.${key}`);
    }
  }
});
