export const ADJACENT_VISUAL_CONTINUITY_VERSION = 1;

function acceptedIllustration(page) {
  if (!page || page.page_type !== "image" || !page.imageStorageKey) return false;
  const status = String(page.qualityStatus || "accepted").toLowerCase();
  return status.startsWith("accepted")
    || status === "strict_accepted"
    || status === "approved"
    || status === "creator_approved";
}

function blueprintContext(page = {}) {
  const snapshot = page.scene_contract?.render_snapshot || {};
  const location = snapshot.location || page.visual_state?.location || page.scene_title || "";
  const cast = Array.isArray(page.cast_present) ? page.cast_present.filter(Boolean) : [];
  return [
    Number(page.scene_number) > 0 ? `scene ${Number(page.scene_number)}` : "",
    location ? `location ${location}` : "",
    cast.length ? `cast ${cast.join(", ")}` : "",
  ].filter(Boolean).join("; ");
}

function referenceFor(page, blueprintPage, relation) {
  return {
    kind: "adjacent_scene",
    storageKey: page.imageStorageKey,
    sourcePageNumber: Number(page.page_number),
    relation,
    continuityVersion: ADJACENT_VISUAL_CONTINUITY_VERSION,
    label: `${relation} approved interior scene (page ${Number(page.page_number)}${blueprintContext(blueprintPage) ? `; ${blueprintContext(blueprintPage)}` : ""}): preserve recurring identity, established rendering details and only the physical states that carry into the current scene. It is secondary evidence: never import an extra copy, obsolete count, obsolete outfit, action, pose, composition, camera or location. The current scene contract is authoritative, including its persistent-entity ledger.`,
  };
}

export function adjacentApprovedIllustrationReferences({
  blueprintPages = [],
  draftPages = [],
  currentPageNumber,
  includeNext = false,
  maximumReferences = includeNext ? 2 : 1,
} = {}) {
  const current = Number(currentPageNumber);
  if (!Number.isFinite(current)) return [];
  const blueprintByNumber = new Map((Array.isArray(blueprintPages) ? blueprintPages : [])
    .map((page) => [Number(page.page_number), page]));
  const candidates = (Array.isArray(draftPages) ? draftPages : [])
    .filter(acceptedIllustration)
    .filter((page) => Number(page.page_number) !== current)
    .map((page) => ({ page, number: Number(page.page_number) }))
    .filter((item) => Number.isFinite(item.number));
  const previous = candidates
    .filter((item) => item.number < current)
    .sort((left, right) => right.number - left.number)[0];
  const next = includeNext
    ? candidates.filter((item) => item.number > current).sort((left, right) => left.number - right.number)[0]
    : null;
  return [
    previous ? referenceFor(previous.page, blueprintByNumber.get(previous.number), "previous") : null,
    next ? referenceFor(next.page, blueprintByNumber.get(next.number), "next") : null,
  ].filter(Boolean).slice(0, Math.max(0, Number(maximumReferences) || 0));
}

export function adjacentContinuityPageNumbers(references = []) {
  return references
    .filter((reference) => reference?.kind === "adjacent_scene")
    .map((reference) => Number(reference.sourcePageNumber))
    .filter(Number.isFinite);
}
