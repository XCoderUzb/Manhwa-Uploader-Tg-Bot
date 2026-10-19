import { config } from "./config.js";

const apiUrl = (method) => `https://api.telegram.org/bot${config.botToken}/${method}`;

export async function call(method, payload = {}) {
  const response = await fetch(apiUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  if (!data?.ok) throw new Error(data?.description || `Telegram ${method} xatosi (${response.status})`);
  return data.result;
}

export function sendMessage(chatId, text, replyMarkup) {
  return call("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export function editMessage(chatId, messageId, text) {
  return call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
  }).catch(() => null);
}

export function answerCallback(callbackId, text) {
  return call("answerCallbackQuery", {
    callback_query_id: callbackId,
    ...(text ? { text } : {}),
  }).catch(() => null);
}

export function sendMediaGroup(chatId, media) {
  return call("sendMediaGroup", { chat_id: chatId, media });
}

export function sendDocument(chatId, url, caption) {
  return call("sendDocument", {
    chat_id: chatId,
    document: url,
    ...(caption ? { caption } : {}),
  });
}

export async function getFileUrl(fileId) {
  const file = await call("getFile", { file_id: fileId });
  return `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
}