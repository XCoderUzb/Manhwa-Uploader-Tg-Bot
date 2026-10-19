import { createRequire } from "node:module";
import path from "node:path";
import sharp from "sharp";
import { config } from "./config.js";

const require = createRequire(import.meta.url);
let pdfjsPromise = null;

function loadPdfjs() {
  if (!pdfjsPromise) pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

function assetDir(name) {
  const root = path.dirname(require.resolve("pdfjs-dist/package.json"));
  return path.join(root, name) + path.sep;
}

// Sahifadagi eng katta rasmni (asl sifatda) ajratib oladi. Topilmasa null qaytaradi.
async function extractEmbeddedImage(page, pdfjs) {
  const { OPS, ImageKind } = pdfjs;
  const opList = await page.getOperatorList();
  const names = [];
  for (let i = 0; i < opList.fnArray.length; i += 1) {
    if (opList.fnArray[i] === OPS.paintImageXObject) names.push(opList.argsArray[i][0]);
  }
  if (!names.length) return null;

  let best = null;
  for (const name of names) {
    const store = name.startsWith("g_") ? page.commonObjs : page.objs;
    if (!store.has(name)) continue;
    const img = store.get(name);
    if (!img?.data || !img.width || !img.height) continue;
    if (img.kind !== ImageKind.RGB_24BPP && img.kind !== ImageKind.RGBA_32BPP) continue;
    if (!best || img.width * img.height > best.width * best.height) best = img;
  }
  if (!best) return null;

  const view = page.getViewport({ scale: 1 });
  const pageRatio = view.width / view.height;
  const imageRatio = best.width / best.height;
  // Rasm butun sahifani egallamasa (masalan, kichik logotip) — sahifani to'liq chizamiz
  if (Math.abs(pageRatio - imageRatio) / pageRatio > 0.04) return null;

  const channels = best.kind === ImageKind.RGBA_32BPP ? 4 : 3;
  const expected = best.width * best.height * channels;
  if (best.data.length < expected) return null;

  return sharp(Buffer.from(best.data.buffer, best.data.byteOffset, expected), {
    raw: { width: best.width, height: best.height, channels },
  })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: config.jpegQuality, mozjpeg: true })
    .toBuffer();
}

// Sahifani rasm qilib chizadi (matn/vektor sahifalar yoki rasmni ajratib bo'lmaganda)
async function renderPage(page) {
  const { createCanvas } = await import("@napi-rs/canvas");
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(4, Math.max(1, config.renderWidth / base.width));
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, canvas, viewport }).promise;
  return sharp(canvas.toBuffer("image/png"))
    .jpeg({ quality: config.jpegQuality, mozjpeg: true })
    .toBuffer();
}

/**
 * PDF'ni sahifa-sahifa rasmga aylantiradi. Har bir sahifa uchun onPage(buffer, index, total) chaqiriladi.
 * Xotirani tejash uchun hamma sahifalar birdaniga saqlanmaydi.
 */
export async function pdfToImages(pdfBuffer, onPage) {
  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    standardFontDataUrl: assetDir("standard_fonts"),
    cMapUrl: assetDir("cmaps"),
    cMapPacked: true,
    wasmUrl: assetDir("wasm"),
    useSystemFonts: false,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;
  const total = doc.numPages;

  try {
    for (let number = 1; number <= total; number += 1) {
      const page = await doc.getPage(number);
      let buffer = null;
      try {
        buffer = await extractEmbeddedImage(page, pdfjs);
      } catch {
        buffer = null;
      }
      if (!buffer) buffer = await renderPage(page);
      page.cleanup();
      await onPage(buffer, number, total);
    }
  } finally {
    await doc.destroy();
  }
  return total;
}
