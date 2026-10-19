import { config } from "./config.js";

export function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Havoladan yoki matndan manhwa kodini (slug) ajratib oladi
export function parseCode(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const link = raw.match(/https?:\/\/\S+/i);
  if (!link) return raw;
  const clean = link[0].replace(/[#?].*$/, "").replace(/\/+$/, "");
  const parts = clean.split("/").filter(Boolean);
  const readIndex = parts.indexOf("oqish");
  if (readIndex > 0) return parts[readIndex - 1];
  return parts[parts.length - 1] || "";
}

// Boblar raqamlarini 5 tadan qilib tugma qatorlariga joylaydi
export function chapterRows(manhwa, chapters, admin) {
  const buttons = chapters
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((chapter) => ({
      text: String(chapter.number),
      callback_data: `ch:${manhwa.id}:${chapter.id}`,
    }));

  const rows = [];
  for (let index = 0; index < buttons.length; index += 5) {
    rows.push(buttons.slice(index, index + 5));
  }
  if (admin) {
    rows.push([{ text: "➕ Yangi bob qo'shish", callback_data: `add:${manhwa.id}` }]);
  }
  return rows;
}

export function startText(admin, chatId) {
  const lines = ["👋 Salom! <b>AniManxwa</b> botiga xush kelibsiz.", ""];
  if (admin) {
    lines.push(
      "<b>Bob yuklash (saytga):</b>",
      "1. Manhwa <b>havolasini</b> yoki <b>kodini</b> yuboring",
      "2. «➕ Yangi bob yuklash» tugmasini bosing, bob raqamini yozing",
      "3. <b>PDF</b> yuboring (yoki rasmlar) — bot o'zi rasmlarni ajratib, bo'laklarga bo'lib saytga yuklaydi",
      "4. «✅ Saytga saqlash» tugmasini bosing",
      "",
      `Masalan: ${config.siteUrl}/yolgizlikda-daraja-kotarish`
    );
  } else {
    lines.push(
      "Manhwa <b>havolasini</b> yoki <b>kodini</b> yuboring — boblar ro'yxatini chiqaraman, kerakli bobni tanlasangiz sahifalari shu yerga tushadi.",
      `Masalan: ${config.siteUrl}/yolgizlikda-daraja-kotarish`
    );
  }
  lines.push("", `Sizning chat ID: <code>${chatId}</code>`);
  return lines.join("\n");
}
