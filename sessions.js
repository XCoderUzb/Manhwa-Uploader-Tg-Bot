const sessions = new Map();

export function getSession(chatId) {
  return sessions.get(String(chatId)) || null;
}

export function setSession(chatId, session) {
  sessions.set(String(chatId), session);
}

export function clearSession(chatId) {
  sessions.delete(String(chatId));
}