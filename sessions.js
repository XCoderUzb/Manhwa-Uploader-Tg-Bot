import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const FILE = path.join(os.tmpdir(), "animanxwa-sessions.json");
const sessions = new Map();

try {
  const saved = JSON.parse(fs.readFileSync(FILE, "utf8"));
  for (const [key, value] of Object.entries(saved)) sessions.set(key, value);
} catch {
  // fayl yo'q yoki buzilgan — bo'sh boshlaymiz
}

function persist() {
  try {
    fs.writeFileSync(FILE, JSON.stringify(Object.fromEntries(sessions)));
  } catch {
    // diskka yozib bo'lmasa, xotirada ishlayveradi
  }
}

export function getSession(chatId) {
  return sessions.get(String(chatId)) || null;
}

export function setSession(chatId, session) {
  sessions.set(String(chatId), session);
  persist();
}

export function clearSession(chatId) {
  sessions.delete(String(chatId));
  persist();
}

export function allSessions() {
  return [...sessions.entries()];
}
