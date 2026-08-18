import { UNIVERSE_OPTIONS } from "../config/bookOptions.js";
import { canonicalDigest } from "../contracts/narrativeV3Canonical.js";
import {
  NARRATIVE_V3_SYNTHETIC_LANGUAGES,
  NARRATIVE_V3_SYNTHETIC_PAGE_COUNTS,
} from "./narrativeV3SyntheticShadow.js";

export const NARRATIVE_V3_FULL_SHADOW_VERSION = 1;
export const NARRATIVE_V3_FULL_SHADOW_EXPECTED_FIXTURES = 108;
export const NARRATIVE_V3_FULL_SHADOW_ARTIFACTS_PER_FIXTURE = 10;

export function narrativeV3FullShadowMatrix() {
  return NARRATIVE_V3_SYNTHETIC_LANGUAGES.flatMap((language) => (
    UNIVERSE_OPTIONS.flatMap((universe) => (
      NARRATIVE_V3_SYNTHETIC_PAGE_COUNTS.map((pageCount) => ({ language, universeId: universe.id, pageCount }))
    ))
  ));
}

export function evaluateNarrativeV3ReleaseGates(reports = [], { replayVerified = false } = {}) {
  const entries = Array.isArray(reports) ? reports : [];
  const qualityPass = entries.length === NARRATIVE_V3_FULL_SHADOW_EXPECTED_FIXTURES
    && entries.every((report) => report.status === "passed"
      && report.deliveryReady === true
      && report.adversarialCases === 5
      && Object.keys(report.artifactDigests || {}).length === NARRATIVE_V3_FULL_SHADOW_ARTIFACTS_PER_FIXTURE);
  const costPass = entries.every((report) => report.providerCalls === 0 && report.paidModelCalls === 0);
  const privacyPass = entries.every((report) => report.customerRoutesTouched === false);
  const durabilityPass = replayVerified === true;
  const eligible = qualityPass && costPass && privacyPass && durabilityPass;
  const bounded = {
    version: NARRATIVE_V3_FULL_SHADOW_VERSION,
    fixtureCount: entries.length,
    passed: entries.filter((report) => report.status === "passed").length,
    quality: { pass: qualityPass, expectedFixtures: NARRATIVE_V3_FULL_SHADOW_EXPECTED_FIXTURES, artifactsPerFixture: NARRATIVE_V3_FULL_SHADOW_ARTIFACTS_PER_FIXTURE },
    cost: { pass: costPass, providerCalls: entries.reduce((total, report) => total + Number(report.providerCalls || 0), 0), paidModelCalls: entries.reduce((total, report) => total + Number(report.paidModelCalls || 0), 0), estimatedUsd: 0 },
    privacy: { pass: privacyPass, customerRoutesTouched: entries.some((report) => report.customerRoutesTouched) },
    durability: { pass: durabilityPass, replayVerified: Boolean(replayVerified) },
    eligible,
  };
  return Object.freeze({ ...bounded, gateDigest: canonicalDigest(bounded) });
}
