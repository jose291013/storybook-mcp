function blueprintCompleteness(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return -1;

  const pages = Array.isArray(value.pages) ? value.pages : [];
  const populatedPages = pages.filter((page) => {
    if (!page || typeof page !== "object") return false;
    return Boolean(String(page.text_prompt || "").trim() || String(page.image_prompt || "").trim());
  }).length;

  let score = pages.length + populatedPages * 10;
  if (String(value.cover?.title || "").trim()) score += 3;
  if (String(value.cover?.image_prompt || "").trim()) score += 15;
  if (Array.isArray(value.cover?.cast_present) && value.cover.cast_present.length) score += 4;
  if (String(value.hero?.name || "").trim()) score += 3;
  if (String(value.language || "").trim()) score += 2;
  if (value.format?.interior_pages) score += 2;
  return score;
}

/**
 * Some model repairs return the complete book under `final_blueprint` while
 * also echoing a root-level page plan made of empty placeholders. Select the
 * most complete recognized blueprint instead of trusting the outer envelope.
 */
export function extractBlueprintCandidate(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return candidate;

  const candidates = [candidate];
  const queue = [candidate];
  const visited = new Set(queue);
  const wrapperKeys = ["final_blueprint", "blueprint", "data", "json", "output", "result"];

  while (queue.length) {
    const current = queue.shift();
    for (const key of wrapperKeys) {
      const nested = current?.[key];
      if (!nested || typeof nested !== "object" || Array.isArray(nested) || visited.has(nested)) continue;
      visited.add(nested);
      candidates.push(nested);
      queue.push(nested);
    }
  }

  return candidates.reduce((best, current) => (
    blueprintCompleteness(current) > blueprintCompleteness(best) ? current : best
  ), candidate);
}
