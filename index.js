import http from "node:http";
import { createChapter, findManhwa, listChapters } from "./base44.js";
import { uploadImage } from "./cloudinary.js";
import { config } from "./config.js";
import { chapterRows, escapeHtml, parseCode, startText } from "./keyboards.js";
import { clearSession, getSession, setSession } from "./sessions.js";
import {
  answerCallback,
  call,
  editMessage,
  getFileUrl,
  sendDocument,
  sendMediaGroup,
  sendMessage,
} from "./telegram.js";

let offset = 0;

const isAdmin = (chatId) => config.adminIds.includes(String(chatId));

// Telegram rasmlar uchun .webp qabul qilmaydi — Cloudinary'dan .jpg shaklida olamiz
const photoUrl = (url) => String(url).replace(/\.webp(\?|$)/i, ".jpg$1");

async function showChapters(chatId, code) {
  const manhwa = await findManhwa(code);
  if (!manhwa) {
    await sendMessage(chatId, "Manhwa topilmadi. Havolani yoki kodni tekshirib, qaytadan yuboring.");
    return;
  }

  const chapters = await listChapters(manhwa.id);
  if (!chapters.length && !isAdmin(chatId)) {
    await sendMessage(chatId, `<b>${escapeHtml(manhwa.title)}</b>\n\nHali bob qo'shilmagan.`);
    return;
  }

  await sendMessage(
    chatId,
    `<b>${escapeHtml(manhwa.title)}</b>\nBoblar soni: ${chapters.length}\n\nKerakli bob raqamini tanlang:`,
    { inline_keyboard: chapterRows(manhwa, chapters, isAdmin(chatId)) }
  );
}

async function sendPages(chatId, manhwaId, chapterId) {
  const chapters = await listChapters(manhwaId);
  const chapter = chapters.find((item) => item.id === chapterId);
  if (!chapter) {
    await sendMessage(chatId, "Bob topilmadi.");
    return;
  }

  const pages = chapter.pages || [];
  if (!pages.length) {
    await sendMessage(chatId, `Bob ${chapter.number} da sahifa yo'q.`);
    return;
  }

  const status = await sendMessage(chatId, `Bob ${chapter.number}: ${pages.length} sahifa yuborilmoqda...`);

  try {
    if (config.pageSendMode === "document") {
      for (let index = 0; index < pages.length; index += 1) {
        await sendDocument(chatId, pages[index].url, `Bob ${chapter.number} — ${index + 1}/${pages.length}`);
        if ((index + 1) % 10 === 0) {
          await editMessage(chatId, status.message_id, `Yuborildi: ${index + 1}/${pages.length} sahifa`);
        }
      }
    } else {
      for (let index = 0; index < pages.length; index += 10) {
        const group = pages.slice(index, index + 10);
        await sendMediaGroup(
          chatId,
          group.map((page) => ({ type: "photo", media: photoUrl(page.url) }))
        );
        await editMessage(
          chatId,
          status.message_id,
          `Yuborildi: ${Math.min(index + 10, pages.length)}/${pages.length} sahifa`
        );
      }
    }
    await editMessage(chatId, status.message_id, `✅ Bob ${chapter.number} — ${pages.length} sahifa yuborildi.`);
  } catch (error) {
    await editMessage(chatId, status.message_id, `❌ Yuborishda xatolik: ${error.message}`);
  }
}

async function startAdd(chatId, manhwaId) {
  setSession(chatId, { step: "number", manhwaId });
  await sendMessage(chatId, "Bob raqamini yozing (masalan: 5). Bekor qilish uchun /bekor.");
}

async function handleNumber(chatId, text, session) {
  const digits = String(text).replace(/[^0-9]/g, "");
  if (digits === "") {
    await sendMessage(chatId, "Faqat raqam yozing (masalan: 5).");
    return;
  }
  const number = Number(digits);
  const status = await sendMessage(
    chatId,
    `Bob <b>${number}</b> uchun sahifalarni yuboring.\n\nSifat yo'qolmasligi uchun ularni <b>fayl</b> qilib yuboring (📎 → Fayl). Tugagach pastdagi «✅ Saqlash» tugmasini bosing.`,
    {
      inline_keyboard: [
        [{ text: "✅ Saqlash", callback_data: `save:${session.manhwaId}:${number}` }],
        [{ text: "❌ Bekor qilish", callback_data: "cancel" }],
      ],
    }
  );
  setSession(chatId, { ...session, step: "pages", number, pages: [], statusId: status.message_id });
}

async function handleMedia(message, session) {
  const chatId = message.chat.id;
  const photo = message.photo?.[message.photo.length - 1];
  const document = message.document?.mime_type?.startsWith("image/") ? message.document : null;
  const fileId = photo?.file_id || document?.file_id;

  if (!fileId) {
    await sendMessage(chatId, "Faqat rasm (sahifa) yuboring.");
    return;
  }

  const fileUrl = await getFileUrl(fileId);
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error("Faylni Telegram'dan yuklab bo'lmadi");

  const buffer = Buffer.from(await response.arrayBuffer());
  const filename = document?.file_name || `page-${session.pages.length + 1}.jpg`;
  const uploaded = await uploadImage(buffer, filename, document?.mime_type || "image/jpeg");

  const pages = [...(session.pages || []), uploaded];
  setSession(chatId, { ...session, pages });

  if (pages.length % 5 === 0 && session.statusId) {
    await editMessage(
      chatId,
      session.statusId,
      `Qabul qilindi: <b>${pages.length}</b> sahifa. Tugagach «✅ Saqlash» tugmasini bosing.`
    );
  }
}

async function saveChapter(chatId, manhwaId, number) {
  const session = getSession(chatId);
  const pages = session?.pages || [];
  if (!pages.length) {
    await sendMessage(chatId, "Sahifa yuborilmagan. Avval rasmlarni yuboring.");
    return;
  }

  await createChapter({
    manhwa_id: manhwaId,
    number,
    title: "",
    pages,
    page_count: pages.length,
  });
  clearSession(chatId);
  await sendMessage(chatId, `✅ Bob ${number} qo'shildi — ${pages.length} sahifa. Saytda darhol ko'rinadi.`);
}

async function handleCallback(query) {
  const chatId = query.message?.chat?.id ?? query.from?.id;
  const data = query.data || "";
  await answerCallback(query.id);

  if (data === "cancel") {
    clearSession(chatId);
    await sendMessage(chatId, "Bekor qilindi.");
    return;
  }

  const [action, ...rest] = data.split(":");
  if (action === "ch" && rest.length === 2) {
    await sendPages(chatId, rest[0], rest[1]);
    return;
  }
  if (action === "add") {
    if (!isAdmin(chatId)) {
      await sendMessage(chatId, "Bu amal faqat admin uchun.");
      return;
    }
    await startAdd(chatId, rest[0]);
    return;
  }
  if (action === "save") {
    if (!isAdmin(chatId)) return;
    await saveChapter(chatId, rest[0], Number(rest[1]));
  }
}

async function handleUpdate(update) {
  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }

  const message = update.message;
  if (!message) return;

  const chatId = message.chat.id;
  const text = (message.text || "").trim();
  const session = getSession(chatId);

  if (text === "/start" || text === "/help") {
    await sendMessage(chatId, startText(isAdmin(chatId), chatId));
    return;
  }
  if (text === "/bekor" || text === "/cancel") {
    clearSession(chatId);
    await sendMessage(chatId, "Bekor qilindi.");
    return;
  }
  if (session?.step === "number") {
    await handleNumber(chatId, text, session);
    return;
  }
  if (session?.step === "pages") {
    await handleMedia(message, session);
    return;
  }
  if (!text) {
    await sendMessage(chatId, "Manhwa havolasini yoki kodini yuboring.");
    return;
  }
  await showChapters(chatId, parseCode(text));
}

function startHealthServer() {
  const port = Number(process.env.PORT || 3000);
  http
    .createServer((request, response) => {
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("AniManxwa bot ishlayapti");
    })
    .listen(port, () => console.log(`Health server: ${port}`));
}

async function main() {
  if (!config.botToken) throw new Error("BOT_TOKEN yo'q");
  if (!config.base44Token) throw new Error("BASE44_TOKEN yo'q");

  const me = await call("getMe");
  await call("deleteWebhook", { drop_pending_updates: false });
  console.log(`Bot ishga tushdi: @${me.username}`);
  startHealthServer();

  for (;;) {
    try {
      const updates = await call("getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: ["message", "callback_query"],
      });
      for (const update of updates) {
        offset = update.update_id + 1;
        await handleUpdate(update).catch((error) => console.error("update xatosi:", error.message));
      }
    } catch (error) {
      console.error("getUpdates xatosi:", error.message);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});