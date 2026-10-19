import sharp from "sharp";
import { config } from "./config.js";

// Xotirani tejash: kesh o'chiriladi, bir vaqtda bitta oqim
sharp.cache(false);
sharp.concurrency(1);

const ANALYZE_WIDTH = 160;

// Berilgan qator atrofida eng "bo'sh" (bir xil rangli) qatorni topadi — chizma o'rtasidan kesmaslik uchun
function findCutRow(gray, height, target, window) {
  const from = Math.max(1, target - window);
  const to = Math.min(height - 1, target + window);
  let bestRow = target;
  let bestScore = Infinity;
  for (let row = from; row <= to; row += 1) {
    const offset = row * ANALYZE_WIDTH;
    let sum = 0;
    let sumSq = 0;
    for (let x = 0; x < ANALYZE_WIDTH; x += 1) {
      const value = gray[offset + x];
      sum += value;
      sumSq += value * value;
    }
    const mean = sum / ANALYZE_WIDTH;
    const score = sumSq / ANALYZE_WIDTH - mean * mean + Math.abs(row - target) * 0.02;
    if (score < bestScore) {
      bestScore = score;
      bestRow = row;
    }
  }
  return bestRow;
}

const toJpeg = (pipeline) => pipeline.jpeg({ quality: config.jpegQuality });

/**
 * Rasmni (Buffer) balandligi bo'yicha bo'laklarga bo'ladi.
 * Qaytaradi: [{ buffer, w, h }]. autoRotate — telefon rasmlari uchun (EXIF yo'nalishi).
 */
export async function sliceImage(buffer, { autoRotate = false } = {}) {
  let input = buffer;
  let meta = await sharp(input, { failOn: "none" }).metadata();

  if (autoRotate && meta.orientation && meta.orientation > 1) {
    input = await toJpeg(sharp(input, { failOn: "none" }).rotate()).toBuffer();
    meta = await sharp(input).metadata();
  }

  const { width, height } = meta;
  const maxHeight = config.sliceHeight;

  // Bo'lish kerak emas
  if (!maxHeight || height <= maxHeight * 1.25) {
    // Oddiy JPEG bo'lsa, o'zgartirmasdan (sifat yo'qolmasdan) yuboramiz
    if (meta.format === "jpeg" && meta.space !== "cmyk") return [{ buffer: input, w: width, h: height }];
    const converted = await toJpeg(sharp(input, { failOn: "none" }).flatten({ background: "#ffffff" })).toBuffer();
    return [{ buffer: converted, w: width, h: height }];
  }

  const parts = Math.ceil(height / maxHeight);
  const step = height / parts;
  const cuts = [0];

  if (config.smartCut) {
    // Faqat toraytirilgan (160 px) kulrang nusxa tahlil qilinadi — xotira deyarli ishlatilmaydi
    const gray = await sharp(input, { failOn: "none" })
      .resize({ width: ANALYZE_WIDTH, height, fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer();
    for (let part = 1; part < parts; part += 1) {
      const row = findCutRow(gray, height, Math.round(step * part), Math.round(step * 0.15));
      cuts.push(Math.max(cuts[cuts.length - 1] + 1, row));
    }
  } else {
    for (let part = 1; part < parts; part += 1) cuts.push(Math.round(step * part));
  }
  cuts.push(height);

  const result = [];
  for (let index = 0; index < cuts.length - 1; index += 1) {
    const top = cuts[index];
    const sliceHeight = cuts[index + 1] - top;
    if (sliceHeight <= 0) continue;
    const out = await toJpeg(
      sharp(input, { failOn: "none" })
        .extract({ left: 0, top, width, height: sliceHeight })
        .flatten({ background: "#ffffff" })
    ).toBuffer();
    result.push({ buffer: out, w: width, h: sliceHeight });
  }
  return result;
}
