// src/services/composePreviewPNG.js
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
export async function composePreviewPNG({
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
  if (!baseUrl) throw new Error("composePreviewPNG: missing baseUrl");
  if (!imageUrl) throw new Error("composePreviewPNG: missing imageUrl");
  if (!outName) throw new Error("composePreviewPNG: missing outName");
  const paperDef = PAPER_MM[paper] || PAPER_MM.A5;
const { w, h } = paperDef;
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
  if (!imgRes.ok) throw new Error(`composePreviewPNG: failed to fetch image (${imgRes.status})`);
  const imgBuf = Buffer.from(await imgRes.arrayBuffer());

  // Decide blocks
  // Cover: image occupies most of safe area, title at top (optional)
  // Page: image top ~60%, text bottom ~40%
  const titleBlockH = title ? Math.round(safeH * (layout === "cover" ? 0.12 : 0.10)) : 0;

// image prend tout (le texte sera en overlay)
const imageBlockTop = safeTop;
const imageBlockH = safeH;


  const imageBlockW = safeW;

  // Resize illustration to fit image block
  // --- PREMIUM: background "cover" flouté + foreground "contain" net ---
const coverLayer = await sharp(imgBuf)
  .resize(imageBlockW, imageBlockH, { fit: "cover", position: "attention" })
  .png()
  .toBuffer();

composites.push({ input: coverLayer, top: imgTop, left: imgLeft });


const fgLayer = await sharp(imgBuf)
  .resize(imageBlockW, imageBlockH, {
    fit: "contain",
    background: { r: 255, g: 255, b: 255, alpha: 0 }, // transparent padding
  })
  .png()
  .toBuffer();

// image plein cadre dans la safe area
const imgLeft = safeLeft;
const imgTop = safeTop;


  // Typography sizes (scale with DPI)
  const titleFont = Math.round((paper === "A5" ? 28 : 34) * (dpi / 150));
  const bodyFont = Math.round((paper === "A5" ? 20 : 24) * (dpi / 150));
  const lineHeight = Math.round(bodyFont * 1.25);

  // Title SVG (within safe area)
  const titleSvg = title
  ? `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <text x="${safeLeft}" y="${safeTop + Math.round(titleBlockH * 0.75)}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${titleFont}"
        font-weight="800"
        fill="#111">${escapeXml(title)}</text>
</svg>`
  : "";


  // Body SVG (bottom text area), with simple wrapping via foreignObject
  const bodyOverlaySvg = body && layout !== "cover"
  ? (() => {
      const approxCharWidth = bodyFont * 0.55;
      const maxChars = Math.max(12, Math.floor((safeW * 0.92) / approxCharWidth));
      const lines = wrapText(body, maxChars).slice(0, 7);

      const tspans = lines.map((line, i) => {
        const dy = i === 0 ? 0 : lineHeight;
        return `<tspan x="${safeLeft}" dy="${dy}">${escapeXml(line)}</tspan>`;
      }).join("");

      const textY = safeTop + Math.round(safeH * 0.72);

      return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="fadeBottom" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="65%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.55)"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.35)"/>
    </filter>
  </defs>

  <!-- gradient bas (dans la safe area) -->
  <rect x="${safeLeft}" y="${safeTop + Math.round(safeH * 0.62)}"
        width="${safeW}" height="${Math.round(safeH * 0.38)}"
        fill="url(#fadeBottom)"/>

  <text y="${textY}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${bodyFont}"
        font-weight="700"
        fill="#fff"
        filter="url(#softShadow)">${tspans}</text>
</svg>`;
    })()
  : "";



  // Base canvas
  const canvas = sharp({
    create: { width, height, channels: 4, background: "#ffffff" },
  });

  const composites = [];

  // Optional: draw a faint safe-area guide (disabled by default)
  // (If you want it: create an SVG rect and composite it.)

  // Title
  if (titleSvg) composites.push({ input: Buffer.from(titleSvg), top: 0, left: 0 });

  // Image
  // Background flou
composites.push({ input: bgLayer, top: imgTop, left: imgLeft });

// Foreground net
composites.push({ input: fgLayer, top: imgTop, left: imgLeft });


  // Body
  if (bodyOverlaySvg) composites.push({ input: Buffer.from(bodyOverlaySvg), top: 0, left: 0 });


  const outBuf = await canvas.composite(composites).png().toBuffer();

  await fs.mkdir(outputsDir, { recursive: true });
  const filename = `${outName}.png`;
  const outPath = path.join(outputsDir, filename);
  await fs.writeFile(outPath, outBuf);

  return `${baseUrl}/outputs/${filename}`;
}
