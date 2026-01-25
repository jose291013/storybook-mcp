import fs from "fs";
import path from "path";

const OUTPUT_DIR = path.resolve("data/outputs");

function ensureDir() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

export async function saveBase64Png(b64, filenameNoExt) {
  ensureDir();
  const file = `${filenameNoExt}.png`;
  const fullPath = path.join(OUTPUT_DIR, file);
  const buffer = Buffer.from(b64, "base64");
  fs.writeFileSync(fullPath, buffer);

  // Render: files are accessible only if you serve them.
  // We'll serve /outputs as static in preview route via BASE_URL.
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  return `${baseUrl}/outputs/${file}`;
}
