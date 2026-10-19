const number = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  botToken: process.env.BOT_TOKEN || "",
  base44Token: process.env.BASE44_TOKEN || "",
  appId: process.env.BASE44_APP_ID || "6ac34a8ddcf74b8abf6b0872",
  cloudName: process.env.CLOUDINARY_CLOUD_NAME || "kfzjpgh5",
  uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || "AniManxwa",
  siteUrl: (process.env.SITE_URL || "https://animanxwa.base44.app").replace(/\/+$/, ""),
  adminIds: (process.env.ADMIN_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  pageSendMode: process.env.PAGE_SEND_MODE === "document" ? "document" : "photo",

  // Rasmlarni bo'laklarga bo'lish: bitta bo'lak balandligi (px). 0 = bo'lmaslik
  sliceHeight: number(process.env.SLICE_HEIGHT, 1500),
  // true bo'lsa, kesish joyi chizma o'rtasidan emas, bo'sh joydan tanlanadi
  smartCut: process.env.SMART_CUT !== "false",
  // PDF sahifasini rasm qilib chizishda kenglik (px) — faqat rasmni ajratib bo'lmagan sahifalar uchun
  renderWidth: number(process.env.RENDER_WIDTH, 1400),
  jpegQuality: number(process.env.JPEG_QUALITY, 90),
  // Cloudinary'ga bir vaqtda nechta rasm yuklanadi
  uploadConcurrency: Math.max(1, number(process.env.UPLOAD_CONCURRENCY, 3)),
};
