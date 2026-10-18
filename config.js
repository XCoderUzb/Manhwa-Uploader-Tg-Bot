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
};