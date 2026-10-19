import { uploadImage } from "./cloudinary.js";
import { config } from "./config.js";
import { pdfToImages } from "./pdf.js";
import { sliceImage } from "./slicer.js";

// Bir nechta bo'lakni cheklangan parallellikda Cloudinary'ga yuklaydi (tartib saqlanadi)
async function uploadParts(parts, namePrefix) {
  const results = new Array(parts.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(config.uploadConcurrency, parts.length) }, async () => {
    while (next < parts.length) {
      const index = next;
      next += 1;
      const part = parts[index];
      const uploaded = await uploadImage(part.buffer, `${namePrefix}-${index + 1}.jpg`, "image/jpeg");
      results[index] = { url: uploaded.url, w: uploaded.w ?? part.w, h: uploaded.h ?? part.h };
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Bitta rasmni (buffer) bo'laklarga bo'lib yuklaydi.
 * Qaytaradi: [{url, w, h}]
 */
export async function processImage(buffer, namePrefix, options = {}) {
  const parts = await sliceImage(buffer, options);
  return uploadParts(parts, namePrefix);
}

/**
 * PDF'ni sahifalarga ajratadi, har birini bo'laklarga bo'ladi va yuklaydi.
 * onProgress({ page, totalPages, pieces }) — har sahifadan keyin chaqiriladi.
 * Qaytaradi: { pages: [{url,w,h}], totalPages }
 */
export async function processPdf(buffer, startIndex, onProgress) {
  const pages = [];
  const totalPages = await pdfToImages(buffer, async (image, page, total) => {
    const uploaded = await processImage(image, `p${startIndex + pages.length + 1}`);
    pages.push(...uploaded);
    if (onProgress) await onProgress({ page, totalPages: total, pieces: pages.length });
  });
  return { pages, totalPages };
}
