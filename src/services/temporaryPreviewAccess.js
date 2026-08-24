import { DIGITAL_PRICING_VERSION_V1 } from "../config/productPricing.js";
import { existingBookProductContract } from "./bookProductContract.js";

export const TEMPORARY_PREVIEW_ACCESS_VERSION = "temporary_preview_72h_v1";
export const TEMPORARY_PREVIEW_ACCESS_HOURS = 72;
export const PREVIEW_EXPIRY_WARNING_HOURS = 24;

const iso = (value) => new Date(value).toISOString();

export function usesTemporaryPreviewAccess(project = {}) {
  return existingBookProductContract(project).pricingVersion === DIGITAL_PRICING_VERSION_V1;
}

export function startTemporaryPreviewAccess(project = {}, completedAt = new Date()) {
  if (!usesTemporaryPreviewAccess(project)) return project.productConfiguration || {};
  const startedAt = iso(completedAt);
  return {
    ...(project.productConfiguration || {}),
    preview_access_version: TEMPORARY_PREVIEW_ACCESS_VERSION,
    preview_access_started_at: startedAt,
    preview_access_expires_at: iso(new Date(Date.parse(startedAt) + TEMPORARY_PREVIEW_ACCESS_HOURS * 3600000)),
    preview_expiry_warning_sent_at: null,
    preview_assets_expired_at: null,
    permanent_digital_access: false,
  };
}

export function grantPermanentDigitalAccess(project = {}, purchasedAt = new Date()) {
  return {
    ...(project.productConfiguration || {}),
    permanent_digital_access: true,
    permanent_digital_access_granted_at: iso(purchasedAt),
  };
}

export function revokePermanentDigitalAccess(project = {}, revokedAt = new Date()) {
  return {
    ...(project.productConfiguration || {}),
    permanent_digital_access: false,
    permanent_digital_access_revoked_at: iso(revokedAt),
  };
}

export function previewAccessState(project = {}, at = new Date()) {
  const temporary = usesTemporaryPreviewAccess(project);
  const permanent = project.status === "purchased" || project.productConfiguration?.permanent_digital_access === true;
  if (!temporary) return { temporary: false, permanent, allowed: true, expired: false, expiresAt: null };
  if (permanent) return { temporary: true, permanent: true, allowed: true, expired: false, expiresAt: null };
  const explicit = project.productConfiguration?.preview_access_expires_at;
  const fallbackStartedAt = project.productConfiguration?.preview_access_started_at || project.updatedAt;
  const expiresAt = explicit || (fallbackStartedAt
    ? iso(new Date(Date.parse(fallbackStartedAt) + TEMPORARY_PREVIEW_ACCESS_HOURS * 3600000))
    : null);
  const expiresMs = Date.parse(expiresAt || "");
  const expired = !Number.isFinite(expiresMs) || expiresMs <= new Date(at).getTime();
  return { temporary: true, permanent: false, allowed: !expired, expired, expiresAt };
}

export function markPreviewExpiryWarningSent(project = {}, sentAt = new Date()) {
  return {
    ...(project.productConfiguration || {}),
    preview_expiry_warning_sent_at: iso(sentAt),
  };
}

export function markPreviewAssetsExpired(project = {}, expiredAt = new Date()) {
  return {
    ...(project.productConfiguration || {}),
    preview_assets_expired_at: iso(expiredAt),
    permanent_digital_access: false,
  };
}
