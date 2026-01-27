export function parseJsonSafe(s) {
  try {
    return JSON.parse(s);
  } catch (e) {
    // try to extract first JSON object
    const m = String(s).match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch (e2) {}
    }
    return null;
  }
}
