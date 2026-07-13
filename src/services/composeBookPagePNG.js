import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const BODY_FONT = path.resolve("assets/fonts/Andika-Regular.ttf");
const TITLE_FONT = path.resolve("assets/fonts/PatrickHand-Regular.ttf");
const FONT_STYLES = {
  school_round: { fontFile: BODY_FONT, fontFamily: "Andika", sizeMultiplier: 1 },
  handwritten_story: { fontFile: TITLE_FONT, fontFamily: "Patrick Hand", sizeMultiplier: 1.08 },
  rounded_playful: { fontFile: path.resolve("assets/fonts/Fredoka-Variable.ttf"), fontFamily: "Fredoka", sizeMultiplier: 0.92 },
  comic_bubble: { fontFile: path.resolve("assets/fonts/ComicNeue-Regular.ttf"), fontFamily: "Comic Neue", sizeMultiplier: 1.02 },
  storybook_bold: { fontFile: path.resolve("assets/fonts/Baloo2-Variable.ttf"), fontFamily: "Baloo 2", sizeMultiplier: 0.94 },
  cursive_magic: { fontFile: path.resolve("assets/fonts/Borel-Regular.ttf"), fontFamily: "Borel", sizeMultiplier: 0.78 },
};

export function getBodyFontRatio(readerAge) {
  const age = Number.parseInt(String(readerAge || "").replace(/[^\d]/g, ""), 10);
  if (Number.isNaN(age) || age <= 3) return 0.043;
  if (age === 4) return 0.041;
  if (age === 5) return 0.04;
  if (age === 6) return 0.0365;
  if (age === 7) return 0.033;
  if (age === 8) return 0.0295;
  return 0.026;
}

export function getBodyFontSize({ width, fontStyle = "school_round", readerAge = 6 }) {
  const selectedFont = FONT_STYLES[fontStyle] || FONT_STYLES.school_round;
  return Math.round(width * getBodyFontRatio(readerAge) * selectedFont.sizeMultiplier);
}

function mmToPx(mm, dpi) {
  return Math.round((mm / 25.4) * dpi);
}

function escapeMarkup(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function renderText({ text, fontFile, fontFamily, fontSize, width, height, color, align = "centre" }) {
  const textOptions = {
    text: `<span foreground="${color}">${escapeMarkup(text)}</span>`,
    font: `${fontFamily} ${fontSize}`,
    fontfile: fontFile,
    width,
    align,
    rgba: true,
    wrap: "word",
  };
  if (height) textOptions.height = height;
  const input = await sharp({
    text: textOptions,
  }).png().toBuffer();
  const metadata = await sharp(input).metadata();
  return { input, width: metadata.width || width, height: metadata.height || height };
}

function pageDecorSvg(width, height) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <circle cx="${Math.round(width * 0.1)}" cy="${Math.round(height * 0.12)}" r="${Math.round(width * 0.035)}" fill="#f8d9b6" opacity="0.75"/>
      <circle cx="${Math.round(width * 0.9)}" cy="${Math.round(height * 0.84)}" r="${Math.round(width * 0.05)}" fill="#cfe7df" opacity="0.75"/>
      <path d="M ${Math.round(width * 0.82)} ${Math.round(height * 0.13)} q ${Math.round(width * 0.035)} ${Math.round(height * -0.045)} ${Math.round(width * 0.07)} 0 q ${Math.round(width * -0.035)} ${Math.round(height * 0.045)} ${Math.round(width * -0.07)} 0" fill="none" stroke="#e7b9a8" stroke-width="${Math.max(2, Math.round(width * 0.003))}" stroke-linecap="round"/>
    </svg>`);
}

function coverShadeSvg(width, height) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#10272d" stop-opacity="0.68"/>
          <stop offset="70%" stop-color="#10272d" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#000" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="38%" fill="url(#shade)"/>
    </svg>`);
}

function coverTitlePanelSvg(width, height, top, panelHeight) {
  const x = Math.round(width * 0.075);
  const panelWidth = Math.round(width * 0.85);
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect x="${x}" y="${top}" width="${panelWidth}" height="${panelHeight}" rx="${Math.round(width * 0.025)}"
        fill="#17343a" fill-opacity="0.56" stroke="#ffffff" stroke-opacity="0.18" stroke-width="${Math.max(1, Math.round(width * 0.0015))}"/>
    </svg>`);
}

export function balanceCoverTitle(value) {
  const words = String(value || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length <= 2) return words.join(" ");
  let bestIndex = 1;
  let smallestDifference = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const left = words.slice(0, index).join(" ").length;
    const right = words.slice(index).join(" ").length;
    const difference = Math.abs(left - right);
    if (difference < smallestDifference) {
      bestIndex = index;
      smallestDifference = difference;
    }
  }
  return `${words.slice(0, bestIndex).join(" ")}\n${words.slice(bestIndex).join(" ")}`;
}

async function composeTextPage({ width, height, title, body, fontStyle, readerAge }) {
  const canvas = sharp({ create: { width, height, channels: 4, background: "#fff8ed" } });
  const composites = [{ input: pageDecorSvg(width, height), top: 0, left: 0 }];
  const selectedFont = FONT_STYLES[fontStyle] || FONT_STYLES.school_round;

  if (title) {
    const titleLayer = await renderText({
      text: title,
      fontFile: selectedFont.fontFile,
      fontFamily: selectedFont.fontFamily,
      fontSize: Math.round(width * 0.043 * selectedFont.sizeMultiplier),
      width: Math.round(width * 0.76),
      height: Math.round(height * 0.18),
      color: "#3d4a4f",
    });
    composites.push({ input: titleLayer.input, top: Math.round(height * 0.13), left: Math.round((width - titleLayer.width) / 2) });
  }

  const bodyLayer = await renderText({
    text: String(body || "").replace(/\s+/g, " ").trim(),
    fontFile: selectedFont.fontFile,
    fontFamily: selectedFont.fontFamily,
    fontSize: getBodyFontSize({ width, fontStyle, readerAge }),
    width: Math.round(width * 0.78),
    color: "#34454c",
  });
  const bodyTop = Math.max(
    Math.round(height * (title ? 0.32 : 0.16)),
    Math.round((height - bodyLayer.height) / 2)
  );
  composites.push({ input: bodyLayer.input, top: bodyTop, left: Math.round((width - bodyLayer.width) / 2) });

  return canvas.composite(composites).png().toBuffer();
}

async function composeCover({ imageBuffer, width, height, title, fontStyle }) {
  const selectedFont = FONT_STYLES[fontStyle] || FONT_STYLES.school_round;
  const balancedTitle = balanceCoverTitle(title);
  const titleLayer = await renderText({
    text: balancedTitle,
    fontFile: selectedFont.fontFile,
    fontFamily: selectedFont.fontFamily,
    fontSize: Math.round(width * 0.052 * selectedFont.sizeMultiplier),
    width: Math.round(width * 0.76),
    color: "#ffffff",
  });
  const titleTop = Math.round(height * 0.065);
  const panelTop = Math.max(0, titleTop - Math.round(height * 0.022));
  const panelHeight = titleLayer.height + Math.round(height * 0.044);
  const shadowLayer = await sharp(titleLayer.input).blur(Math.max(1, width * 0.0025)).png().toBuffer();

  return sharp(imageBuffer)
    .resize(width, height, { fit: "cover", position: "attention" })
    .composite([
      { input: coverShadeSvg(width, height), top: 0, left: 0 },
      { input: coverTitlePanelSvg(width, height, panelTop, panelHeight), top: 0, left: 0 },
      { input: shadowLayer, top: titleTop + Math.round(height * 0.004), left: Math.round((width - titleLayer.width) / 2) },
      { input: titleLayer.input, top: titleTop, left: Math.round((width - titleLayer.width) / 2) },
    ])
    .png()
    .toBuffer();
}

export async function composeBookPagePNG({
  baseUrl,
  imageUrl = "",
  title = "",
  body = "",
  outName,
  pageType = "image",
  pageNumber,
  fontStyle = "school_round",
  readerAge = 6,
  dpi = 150,
  outputsDir = "data/outputs",
}) {
  if (!baseUrl) throw new Error("composeBookPagePNG: missing baseUrl");
  if (!outName) throw new Error("composeBookPagePNG: missing outName");

  const width = mmToPx(210, dpi);
  const height = width;
  let output;

  if (["text", "opening_text", "closing_text"].includes(pageType)) {
    output = await composeTextPage({ width, height, title, body, fontStyle, readerAge });
  } else {
    if (!imageUrl) throw new Error(`composeBookPagePNG: ${pageType} requires imageUrl`);
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`composeBookPagePNG: failed to fetch image (${response.status})`);
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    output = pageType === "cover"
      ? await composeCover({ imageBuffer, width, height, title, fontStyle })
      : await sharp(imageBuffer).resize(width, height, { fit: "cover", position: "attention" }).png().toBuffer();
  }

  await fs.mkdir(outputsDir, { recursive: true });
  const filename = `${outName}.png`;
  await fs.writeFile(path.join(outputsDir, filename), output);
  return `${baseUrl}/outputs/${filename}`;
}
