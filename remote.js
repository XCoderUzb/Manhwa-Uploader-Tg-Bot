import { config } from "./config.js";

// Google Drive / Dropbox havolalarini to'g'ridan-to'g'ri yuklash havolasiga aylantiradi
export function normalizeUrl(raw) {
  const url = String(raw).trim();
  const drive =
    url.match(/drive\.google\.com\/file\/d\/([\w-]+)/i) ||
    url.match(/drive\.google\.com\/(?:open|uc)\?[^#]*id=([\w-]+)/i);
  if (drive) return `https://drive.usercontent.google.com/download?id=${drive[1]}&export=download&confirm=t`;
  if (/dropbox\.com/i.test(url)) return url.replace(/[?&]dl=0/, "").replace(/(\?|$)/, (m) => (m === "?" ? "?dl=1&" : "?dl=1"));
  return url;
}

export function fileKind(buffer) {
  if (buffer.length > 4 && buffer.subarray(0, 4).toString("latin1") === "%PDF") return "pdf";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image";
  if (buffer.subarray(1, 4).toString("latin1") === "PNG") return "image";
  if (buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP") return "image";
  return null;
}

export async function downloadFromUrl(raw) {
  const max = config.maxFileMb * 1024 * 1024;
  const response = await fetch(normalizeUrl(raw), { redirect: "follow" });
  if (!response.ok) throw new Error(`Havola ochilmadi (${response.status}). Fayl hamma uchun ochiq ekaniga ishonch hosil qiling.`);

  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > max) throw new Error(`Fayl ${config.maxFileMb} MB dan katta. Uni kichikroq qismlarga bo'lib yuboring.`);

  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > max) throw new Error(`Fayl ${config.maxFileMb} MB dan katta. Uni kichikroq qismlarga bo'lib yuboring.`);
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  if (!fileKind(buffer)) {
    throw new Error("Havoladan PDF yoki rasm kelmadi. Havola to'g'ridan-to'g'ri faylga olib borishi va hamma uchun ochiq bo'lishi kerak.");
  }
  return buffer;
}
