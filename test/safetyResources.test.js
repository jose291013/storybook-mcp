import test from "node:test";
import assert from "node:assert/strict";
import {
  SAFETY_RESOURCE_LAST_REVIEWED_AT,
  SAFETY_RESOURCE_REGISTRY_VERSION,
  localizedSafetyResources,
  normalizeSafetyCountry,
  safetyCountryOptions,
} from "../src/services/safetyResources.js";

test("safety resources require the child's current country and never infer it from language", () => {
  const french = localizedSafetyResources({ locale: "FR" });
  const spanish = localizedSafetyResources({ locale: "ES" });
  assert.equal(french.countryRequired, true);
  assert.equal(spanish.countryRequired, true);
  assert.equal(french.countryCode, "");
  assert.deepEqual(french.resources, []);
  assert.deepEqual(spanish.resources, []);
  assert.equal(french.version, SAFETY_RESOURCE_REGISTRY_VERSION);
  assert.equal(french.reviewedAt, SAFETY_RESOURCE_LAST_REVIEWED_AT);
});

test("the initial country registry exposes only curated resources with explicit sources", () => {
  for (const locale of ["FR", "ES", "EN"]) {
    const options = safetyCountryOptions(locale);
    for (const code of ["FR", "ES", "BE", "CH", "GB", "US", "CA", "EU_OTHER", "OTHER"]) {
      assert.ok(options.some((option) => option.code === code && option.label), `${locale}.${code}`);
    }
  }

  for (const countryCode of ["FR", "ES", "BE", "CH", "GB", "US", "CA", "EU_OTHER"]) {
    const payload = localizedSafetyResources({ countryCode, locale: "EN" });
    assert.equal(payload.countryRequired, false, countryCode);
    assert.ok(payload.resources.length >= 1, countryCode);
    for (const resource of payload.resources) {
      assert.match(resource.phone, /\d/);
      assert.match(resource.website, /^https:\/\//);
      assert.match(resource.sourceUrl, /^https:\/\//);
      assert.ok(resource.label);
    }
  }
});

test("unknown and other countries receive a truthful local fallback instead of an invented number", () => {
  assert.equal(normalizeSafetyCountry("XX"), "");
  const unknown = localizedSafetyResources({ countryCode: "XX", locale: "EN" });
  assert.equal(unknown.countryRequired, true);
  assert.deepEqual(unknown.resources, []);
  assert.ok(unknown.fallbackMessage);

  const other = localizedSafetyResources({ countryCode: "OTHER", locale: "EN" });
  assert.equal(other.countryRequired, false);
  assert.deepEqual(other.resources, []);
  assert.ok(other.fallbackMessage);
});
