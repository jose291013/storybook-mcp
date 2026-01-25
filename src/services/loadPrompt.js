import fs from "fs";
import path from "path";

export function loadPrompt(filename) {
  const p = path.resolve("src/prompts", filename);
  return fs.readFileSync(p, "utf8");
}
