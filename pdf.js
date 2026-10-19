import { createRequire } from "node:module";
import path from "node:path";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
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

/* ------------------------------------------------------------------ */
/* 1-USUL (tez va xotirani tejaydi): PDF ichidagi JPEG'ni dekodlamasdan */
/* to'g'ridan-to'g'ri olamiz — asl sifat, deyarli xotira ishlatmaydi.   */
/* ------------------------------------------------------------------ */

function isDct(dict, context) {
  const filter = context.lookup(dict.get(PDFName.of("Filter")));
  if (filter instanceof PDFName) return filter.decodeText() === "DCTDecode";
  if (filter instanceof PDFArray && filter.size() === 1) {
    const only = context.lookup(filter.get(0));
    return only instanceof PDFName && only.decodeText() === "DCTDecode";
  }
  return false;
}

function numberOf(context, dict, key) {
  const value = context.lookup(dict.get(PDFName.of(key)));
  return value && typeof value.asNumber === "function" ? value.asNumber() : 0;
}

// Sahifadagi butun sahifani egallagan JPEG'ni topadi; bo'lmasa null
function directJpeg(page, context) {
  if (page.getRotation().angle !== 0) return null;
  const resources = page.node.Resources();
  const xobjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  if (!xobjects) return null;

  const { width: pageW, height: pageH } = page.getSize();
  let best = null;
  for (const [, ref] of xobjects.entries()) {
    const stream = context.lookup(ref);
    if (!(stream instanceof PDFRawStream)) continue;
    const dict = stream.dict;
    const subtype = context.lookup(dict.get(PDFName.of("Subtype")));
    if (!(subtype instanceof PDFName) || subtype.decodeText() !== "Image") continue;
    if (!isDct(dict, context)) continue;
    const width = numberOf(context, dict, "Width");
    const height = numberOf(context, dict, "Height");
    if (!width || !height) continue;
    if (!best || width * height > best.width * best.height) best = { stream, width, height };
  }
  if (!best) return null;

  const pageRatio = pageW / pageH;
  const imageRatio = best.width / best.height;
  if (Math.abs(pageRatio - imageRatio) / pageRatio > 0.04) return null;
  return best.stream.getContents();
}

/* ------------------------------------------------------------------ */
/* 2-USUL (zaxira): JPEG bo'lmagan yoki murakkab sahifalar — pdf.js    */
/* ------------------------------------------------------------------ */

async function extractDecodedImage(page, pdfjs) {
  const { OPS, ImageKind } = pdfjs;
  const opList = await page.getOperatorList();
  const names = [];
  for (let i = 0; i < opList.fnArray.length; i += 1) {
    if (opList.fnArray[i] === OPS.paintImageXObject) names.push(opList.argsArray[i][0]);
  }
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
  if (Math.abs(pageRatio - best.width / best.height) / pageRatio > 0.04) return null;

  const channels = best.kind === ImageKind.RGBA_32BPP ? 4 : 3;
  const expected = best.width * best.height * channels;
  if (best.data.length < expected) return null;

  return sharp(Buffer.from(best.data.buffer, best.data.byteOffset, expected), {
    raw: { width: best.width, height: best.height, channels },
  })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: config.jpegQuality, mozjpeg: false })
    .toBuffer();
}

async function renderPage(page) {
  const { createCanvas } = await import("@napi-rs/canvas");
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, Math.max(1, config.renderWidth / base.width));
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, canvas, viewport }).promise;
  return canvas.toBuffer("image/jpeg", config.jpegQuality);
}

function createFallback(pdfBuffer) {
  let docPromise = null;
  return {
    async page(number) {
      const pdfjs = await loadPdfjs();
      if (!docPromise) {
        docPromise = pdfjs.getDocument({
          data: new Uint8Array(pdfBuffer), // nusxa: pdf-lib ishlatayotgan buferga tegmaydi
          standardFontDataUrl: assetDir("standard_fonts"),
          cMapUrl: assetDir("cmaps"),
          cMapPacked: true,
          wasmUrl: assetDir("wasm"),
          useSystemFonts: false,
          verbosity: 0,
        }).promise;
      }
      const doc = await docPromise;
      const page = await doc.getPage(number);
      try {
        let buffer = null;
        try {
          buffer = await extractDecodedImage(page, pdfjs);
        } catch {
          buffer = null;
        }
        return buffer || (await renderPage(page));
      } finally {
        page.cleanup();
      }
    },
    async close() {
      if (docPromise) await (await docPromise).destroy().catch(() => null);
    },
  };
}

/**
 * PDF'ni sahifa-sahifa rasmga aylantiradi. Har bir sahifa uchun onPage(buffer, number, total) chaqiriladi.
 * Hamma sahifalar birdaniga xotirada saqlanmaydi.
 */
export async function pdfToImages(pdfBuffer, onPage) {
  const fallback = createFallback(pdfBuffer);
  let pdfLibDoc = null;
  try {
    pdfLibDoc = await PDFDocument.load(pdfBuffer, {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
    });
  } catch (error) {
    console.error("pdf-lib ocholmadi, zaxira usul:", error.message);
  }

  try {
    if (!pdfLibDoc) {
      const pdfjs = await loadPdfjs();
      const probe = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer), verbosity: 0 }).promise;
      const total = probe.numPages;
      await probe.destroy();
      for (let number = 1; number <= total; number += 1) {
        await onPage(await fallback.page(number), number, total);
      }
      return total;
    }

    const pages = pdfLibDoc.getPages();
    const total = pages.length;
    for (let index = 0; index < total; index += 1) {
      let buffer = null;
      try {
        buffer = directJpeg(pages[index], pdfLibDoc.context);
      } catch {
        buffer = null;
      }
      if (!buffer) buffer = await fallback.page(index + 1);
      await onPage(buffer, index + 1, total);
    }
    return total;
  } finally {
    await fallback.close();
  }
}
