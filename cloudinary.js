import { config } from "./config.js";

export async function uploadImage(buffer, filename, mimeType) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType || "image/jpeg" }), filename);
  form.append("upload_preset", config.uploadPreset);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
    { method: "POST", body: form }
  );
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.secure_url) {
    throw new Error(data?.error?.message || `Cloudinary'ga yuklanmadi (${response.status})`);
  }

  return { url: data.secure_url, w: data.width, h: data.height };
}