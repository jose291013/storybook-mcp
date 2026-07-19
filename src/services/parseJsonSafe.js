export function parseJsonSafe(s) {
  const source = String(s || "").trim();
  try {
    return JSON.parse(source);
  } catch {}

  // Some models still wrap an otherwise valid object in a Markdown fence.
  const unfenced = source.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (unfenced !== source) {
    try {
      return JSON.parse(unfenced);
    } catch {}
  }

  // Extract the first balanced JSON object without greedily joining two objects.
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === "{") {
      if (start < 0) start = index;
      depth += 1;
    } else if (character === "}" && start >= 0) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(start, index + 1));
        } catch {
          start = -1;
        }
      }
    }
  }
  return null;
}
