// src/services/composePrintPreviewPNG.js
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const PAPER_MM = {
  A5: { w: 148, h: 210 },
  A4: { w: 210, h: 297 },
};

function mmToPx(mm, dpi) {
  // 1 inch = 25.4 mm
  return Math.round((mm / 25.4) * dpi);
}

function escapeXml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
function wrapText(text, maxCharsPerLine) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (test.length <= maxCharsPerLine) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}


/**
 * Compose a print-like preview PNG with exact A5/A4 ratio.
 * - White page
 * - Safe margin & text area
 * - Illustration placed as "full-bleed-ish" inside safe area (or top block)
 * - Clean typography (SVG overlay)
 */
export async function composePrintPreviewPNG({
  baseUrl,
  imageUrl,
  title = "",
  body = "",
  outName,
  paper = "A5",     // "A5" | "A4"
  dpi = 150,        // 150/200/300
  layout = "page",  // "cover" | "page"
  outputsDir = "data/outputs",
}) {
  if (!baseUrl) throw new Error("composePrintPreviewPNG: missing baseUrl");
  if (!imageUrl) throw new Error("composePrintPreviewPNG: missing imageUrl");
  if (!outName) throw new Error("composePrintPreviewPNG: missing outName");
  if (!PAPER_MM[paper]) throw new Error(`composePrintPreviewPNG: unsupported paper ${paper}`);

  const { w, h } = PAPER_MM[paper];
  const width = mmToPx(w, dpi);
  const height = mmToPx(h, dpi);

  // Layout in mm (print-like)
  const marginMm = 10;         // safe margin
  const gutterMm = 0;          // can be >0 later for binding
  const marginPx = mmToPx(marginMm, dpi);
  const gutterPx = mmToPx(gutterMm, dpi);

  const safeLeft = marginPx + gutterPx;
  const safeRight = width - marginPx;
  const safeTop = marginPx;
  const safeBottom = height - marginPx;

  const safeW = safeRight - safeLeft;
  const safeH = safeBottom - safeTop;
  


  // Fetch image
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`composePrintPreviewPNG: failed to fetch image (${imgRes.status})`);
  const imgBuf = Buffer.from(await imgRes.arrayBuffer());

  // Decide blocks
  // Cover: image occupies most of safe area, title at top (optional)
  // Page: image top ~60%, text bottom ~40%
  const titleBlockH = title ? Math.round(safeH * (layout === "cover" ? 0.12 : 0.10)) : 0;

// image prend tout (le texte sera en overlay)
// FULL BLEED: l’image remplit toute la page
const imageBlockTop = 0;
const imageBlockH = height;
const imageBlockW = width;

const imgLeft = 0;
const imgTop = 0;


// PREMIUM: background cover flouté + foreground contain net
// FULL BLEED: une seule image sur toute la page
const coverLayer = await sharp(imgBuf)
  .resize(width, height, { fit: "cover", position: "attention" })
  .png()
  .toBuffer();




  // Typography sizes (scale with DPI)
  const titleFont = Math.round((paper === "A5" ? 28 : 34) * (dpi / 150));
  const bodyFont = Math.round((paper === "A5" ? 20 : 24) * (dpi / 150));
  const colW = Math.round(safeW * 0.38);        // colonne plus élégante
const lineHeight = Math.round(bodyFont * 1.45); // meilleure lisibilité

const colX = safeLeft;
  const titleY = safeTop + Math.round(titleFont * 1.2);
const textStartY = safeTop + Math.round(titleFont * 2.6);


  // Title SVG (within safe area)
  let bodyTspans = "";
if (body && layout !== "cover") {
  const approxCharWidth = bodyFont * 0.55;
  const maxChars = Math.max(12, Math.floor(colW / approxCharWidth));
  const lines = wrapText(body, maxChars).slice(0, 10);

  bodyTspans = lines
    .map((line, i) => {
      const dy = i === 0 ? 0 : lineHeight;
      return `<tspan x="${colX}" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join("");
}

  const overlaySvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <!-- Dégradé latéral gauche (pour la lisibilité) -->
    <linearGradient id="fadeLeft" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(0,0,0,0.45)"/>
      <stop offset="60%" stop-color="rgba(0,0,0,0.12)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>

    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.35)"/>
    </filter>
  </defs>

  <!-- bande dégradée sur toute la hauteur, limitée à la zone colonne -->
  <rect x="0" y="0" width="${safeLeft + colW + 30}" height="${height}" fill="url(#fadeLeft)"/>

  <!-- Titre (toujours, cover + pages) -->
  ${title ? `
    <text x="${colX}" y="${titleY}"
          font-family="Arial, Helvetica, sans-serif"
          font-size="${titleFont}"
          font-weight="800"
          letter-spacing="0.4"
          fill="#fff"
          filter="url(#softShadow)">${escapeXml(title)}</text>
  ` : ""}

  <!-- Texte (pages uniquement) -->
  <rect
  x="${colX - 14}"
  y="${safeTop - 12}"
  width="${colW + 28}"
  height="${Math.round(safeH * 0.42)}"
  rx="18"
  fill="rgba(0,0,0,0.07)"
/>

  ${(body && layout !== "cover") ? `
    <text x="${colX}" y="${textStartY}"
          font-family="Arial, Helvetica, sans-serif"
          font-size="${bodyFont}"
          font-weight="700"
          fill="#fff"
          filter="url(#softShadow)">${bodyTspans}</text>
  ` : ""}
</svg>`;


  
  // Base canvas
  const canvas = sharp({
    create: { width, height, channels: 4, background: "#ffffff" },
  });

  const composites = [];
composites.push({ input: coverLayer, top: 0, left: 0 });
composites.push({ input: Buffer.from(overlaySvg), top: 0, left: 0 });




  
  const outBuf = await canvas.composite(composites).png().toBuffer();

  await fs.mkdir(outputsDir, { recursive: true });
  const filename = `${outName}.png`;
  const outPath = path.join(outputsDir, filename);
  await fs.writeFile(outPath, outBuf);

  return `${baseUrl}/outputs/${filename}`;
}
