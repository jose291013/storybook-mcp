import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultNewBookLanguage,
  detectBrowserLanguage,
  initialCreatorLanguage,
  normalizeSupportedLanguage,
} from "../public/languagePreference.js";

test("normalizes supported browser locale variants", () => {
  assert.equal(normalizeSupportedLanguage("es-ES"), "ES");
  assert.equal(normalizeSupportedLanguage("fr_CA"), "FR");
  assert.equal(normalizeSupportedLanguage("de-DE"), "");
  assert.equal(detectBrowserLanguage(["de-DE", "en-GB", "fr-FR"]), "EN");
});

test("creator language respects explicit choices before browser defaults", () => {
  assert.equal(initialCreatorLanguage({
    queryLanguage: "FR",
    referrerLanguage: "ES",
    storedLanguage: "EN",
    browserLanguages: ["es-ES"],
  }), "FR");
  assert.equal(initialCreatorLanguage({
    referrerLanguage: "ES",
    storedLanguage: "EN",
    browserLanguages: ["fr-FR"],
  }), "ES");
  assert.equal(initialCreatorLanguage({
    storedLanguage: "EN",
    browserLanguages: ["es-ES"],
  }), "EN");
});

test("creator language uses the first supported browser language then French fallback", () => {
  assert.equal(initialCreatorLanguage({ browserLanguages: ["ca-ES", "es-ES", "fr-FR"] }), "ES");
  assert.equal(initialCreatorLanguage({ browserLanguages: ["de-DE", "it-IT"] }), "FR");
});

test("a new book follows the explicit storefront language or the Creator language", () => {
  assert.equal(defaultNewBookLanguage({ queryBookLanguage: "ES", interfaceLanguage: "FR" }), "ES");
  assert.equal(defaultNewBookLanguage({ interfaceLanguage: "EN" }), "EN");
  assert.equal(defaultNewBookLanguage(), "FR");
});
