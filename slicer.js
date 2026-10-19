import sharp from "sharp";
import { config } from "./config.js";

// Berilgan qator atrofida eng "bo'sh" (bir xil rangli) qatorni topadi — shunda rasm chizma o'rtasidan kesilmaydi
function findCutRow(gray, width, height, target, window) {
  const from = Math.max(1, target - window);
  const to = Math.min(height - 1, target + window);
  let bestRow = target;
  let bestScore = Infinity;
  for (let row = from; row <= to; row += 1) {
    const offset = row * width;
    let sum = 0;
    let sumSq = 0;
    for (let x = 0; x < width; x += 1) {
      const value = gray[offset + x];
      sum += value;
      sumSq += value * value;
    }
    const mean = sum / width;
    const variance = sumSq / width - mean * mean;
    // Kesish nuqtasi nishonga yaqin bo'lgani ma'qul (kichik jarima)
    const score = variance + Math.abs(row - target) * 0.02;
    if (score < bestScore) {
      bestScore = score;
      bestRow = row;
    }
  }
  return bestRow;
}

/**
 * Bitta rasmni (Buffer) balandligi bo'yicha bo'laklarga bo'ladi.
 * Qaytaradi: [{ buffer, w, h }]
 */
export async function sliceImage(buffer) {
  const image = sharp(buffer, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  const normalized = await image.jpeg({ quality: config.jpegQuality, mozjpeg: true }).toBuffer();
  const { width, height } = await sharp(normalized).metadata();

  const maxHeight = config.sliceHeight;
  if (!maxHeight || height <= maxHeight * 1.25) {
    return [{ buffer: normalized, w: width, h: height, format: meta.format }];
  }

  const parts = Math.ceil(height / maxHeight);
  const step = height / parts;

  const gray = await sharp(normalized).greyscale().raw().toBuffer();
  const cuts = [0];
  for (let part = 1; part < parts; part += 1) {
    const target = Math.round(step * part);
    const row = config.smartCut
      ? findCutRow(gray, width, height, target, Math.round(step * 0.15))
      : target;
    cuts.push(Math.max(cuts[cuts.length - 1] + 1, row));
  }
  cuts.push(height);

  const result = [];
  for (let index = 0; index < cuts.length - 1; index += 1) {
    const top = cuts[index];
    const sliceHeight = cuts[index + 1] - top;
    if (sliceHeight <= 0) continue;
    const out = await sharp(normalized)
      .extract({ left: 0, top, width, height: sliceHeight })
      .jpeg({ quality: config.jpegQuality, mozjpeg: true })
      .toBuffer();
    result.push({ buffer: out, w: width, h: sliceHeight });
  }
  return result;
}
