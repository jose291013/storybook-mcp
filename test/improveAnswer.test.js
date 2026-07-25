import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { improveQuestionnaireAnswer } from "../src/services/improveAnswer.js";
import { isTransientOpenAIError } from "../src/services/openaiErrorPolicy.js";
import { UI_TEXT } from "../public/i18n.js";

test("answer improvement retries one transient OpenAI failure and preserves the result", async () => {
  let calls = 0;
  const runner = async () => {
    calls += 1;
    if (calls === 1) {
      throw Object.assign(new Error("The server had an error processing your request."), {
        status: 500,
        type: "server_error",
        headers: { "x-openai-ide-error-code": "service_auth_failure" },
      });
    }
    return { improved_answer: "Nolan aimerait apprendre à demander de l’aide avec confiance." };
  };

  const result = await improveQuestionnaireAnswer({
    question: "Quel rêve aimerait-il accomplir ?",
    answer: "demander de l'aide",
    locale: "FR",
  }, { runner });

  assert.equal(calls, 2);
  assert.equal(result, "Nolan aimerait apprendre à demander de l’aide avec confiance.");
});

test("answer improvement does not retry a permanent invalid request", async () => {
  let calls = 0;
  const runner = async () => {
    calls += 1;
    throw Object.assign(new Error("Invalid request"), { status: 400 });
  };

  await assert.rejects(
    improveQuestionnaireAnswer({ question: "Question", answer: "Réponse", locale: "FR" }, { runner }),
    /Invalid request/,
  );
  assert.equal(calls, 1);
});

test("the observed service-auth failure is transient and creator errors stay localized", async () => {
  assert.equal(isTransientOpenAIError({
    status: 500,
    type: "server_error",
    headers: { "x-openai-ide-root-error-code": "service_auth_failure" },
  }), true);
  assert.equal(isTransientOpenAIError(Object.assign(new Error("Invalid request"), { status: 400 })), false);

  for (const locale of ["FR", "ES", "EN"]) {
    assert.ok(UI_TEXT[locale].improveError);
    assert.ok(UI_TEXT[locale].improveRateLimit);
  }

  const [route, app] = await Promise.all([
    fs.readFile("src/routes/improveAnswer.js", "utf8"),
    fs.readFile("public/app.js", "utf8"),
  ]);
  assert.match(route, /improve_temporarily_unavailable/);
  assert.match(route, /requestId/);
  assert.doesNotMatch(route, /console\.error\("improve-answer failed", error\)/);
  assert.match(app, /payload\.code === "improve_temporarily_unavailable"/);
});
