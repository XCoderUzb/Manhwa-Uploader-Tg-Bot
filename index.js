import http from "node:http";
import { createChapter, findManhwa, listChapters } from "./base44.js";
import { config } from "./config.js";
import { chapterRows, escapeHtml, parseCode, startText } from "./keyboards.js";
import { clearSession, getSession, setSession } from "./sessions.js";
import { processImage, processPdf } from "./uploader.js";
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

  if (isAdmin(chatId)) {
    const numbers = chapters
      .map((chapter) => chapter.number)
      .sort((a, b) => a - b)
      .join(", ");
    await sendMessage(
      chatId,
      `<b>${escapeHtml(manhwa.title)}</b>\nSaytdagi boblar: ${numbers || "hali yo'q"}\n\nQuyidagi tugma orqali yangi bobni <b>saytga</b> yuklang:`,
      {
        inline_keyboard: [
          [{ text: "➕ Yangi bob yuklash (saytga)", callback_data: `add:${manhwa.id}` }],
          ...(chapters.length
            ? [[{ text: "📖 Boblarni Telegramda ko'rish", callback_data: `read:${manhwa.id}` }]]
            : []),
        ],
      }
    );
    return;
  }

  if (!chapters.length) {
    await sendMessage(chatId, `<b>${escapeHtml(manhwa.title)}</b>\n\nHali bob qo'shilmagan.`);
    return;
  }

  await sendMessage(
    chatId,
    `<b>${escapeHtml(manhwa.title)}</b>\nBoblar soni: ${chapters.length}\n\nKerakli bob raqamini tanlang:`,
    { inline_keyboard: chapterRows(manhwa, chapters, false) }
  );
}

async function showReadList(chatId, manhwaId) {
  const chapters = await listChapters(manhwaId);
  await sendMessage(chatId, "Kerakli bob raqamini tanlang (sahifalar shu chatga yuboriladi):", {
    inline_keyboard: chapterRows({ id: manhwaId }, chapters, false),
  });
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

const saveKeyboard = (manhwaId, number) => ({
  inline_keyboard: [
    [{ text: "✅ Saytga saqlash", callback_data: `save:${manhwaId}:${number}` }],
    [{ text: "❌ Bekor qilish", callback_data: "cancel" }],
  ],
});

async function handleNumber(chatId, text, session) {
  const digits = String(text).replace(/[^0-9]/g, "");
  if (digits === "") {
    await sendMessage(chatId, "Faqat raqam yozing (masalan: 5).");
    return;
  }
  const number = Number(digits);

  const existing = await listChapters(session.manhwaId);
  if (existing.some((chapter) => Number(chapter.number) === number)) {
    await sendMessage(chatId, `Bob ${number} saytda allaqachon bor. Boshqa raqam yozing yoki /bekor.`);
    return;
  }

  await sendMessage(
    chatId,
    [
      `Bob <b>${number}</b> uchun fayllarni yuboring:`,
      "",
      "📄 <b>PDF</b> — o'zi rasmlarga ajratadi va bo'laklarga bo'lib yuklaydi",
      "🖼 yoki rasmlar (📎 → Fayl qilib yuborsangiz sifat saqlanadi)",
      "",
      "Bir nechta PDF/rasm yuborsangiz, ular yuborilgan tartibda birlashadi. Tugagach «✅ Saytga saqlash» ni bosing.",
    ].join("\n"),
    saveKeyboard(session.manhwaId, number)
  );
  setSession(chatId, { ...session, step: "pages", number, pages: [] });
}

async function downloadFile(fileId) {
  const fileUrl = await getFileUrl(fileId).catch((error) => {
    if (/too big/i.test(error.message)) {
      throw new Error("Fayl 20 MB dan katta — Telegram bot orqali bunday faylni yuklab bo'lmaydi. PDF'ni bir necha qismga bo'lib yuboring.");
    }
    throw error;
  });
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error("Faylni Telegram'dan yuklab bo'lmadi");
  return Buffer.from(await response.arrayBuffer());
}

function appendPages(chatId, added) {
  const current = getSession(chatId);
  if (!current) return null;
  const pages = [...(current.pages || []), ...added];
  setSession(chatId, { ...current, pages });
  return pages;
}

async function handleMedia(message, session) {
  const chatId = message.chat.id;
  const photo = message.photo?.[message.photo.length - 1];
  const document = message.document;
  const isPdf =
    document && (document.mime_type === "application/pdf" || /\.pdf$/i.test(document.file_name || ""));
  const isImage = photo || (document && document.mime_type?.startsWith("image/"));

  if (!isPdf && !isImage) {
    await sendMessage(chatId, "Faqat PDF yoki rasm yuboring.");
    return;
  }

  const startIndex = session.pages?.length || 0;

  try {
    if (isPdf) {
      const status = await sendMessage(chatId, `📄 ${escapeHtml(document.file_name || "PDF")} qabul qilindi, yuklab olinmoqda...`);
      const buffer = await downloadFile(document.file_id);

      const { pages, totalPages } = await processPdf(buffer, startIndex, async ({ page, totalPages: total, pieces }) => {
        if (page === total || page % 3 === 0) {
          await editMessage(chatId, status.message_id, `⏳ PDF: ${page}/${total} sahifa ishlandi (${pieces} bo'lak)...`);
        }
      });

      const all = appendPages(chatId, pages);
      if (!all) return;
      await editMessage(chatId, status.message_id, `✅ PDF tayyor: ${totalPages} sahifa → ${pages.length} bo'lak.`);
      await sendMessage(
        chatId,
        `Hozircha bob ${session.number} da jami <b>${all.length}</b> bo'lak. Yana fayl yuborishingiz yoki saqlashingiz mumkin:`,
        saveKeyboard(session.manhwaId, session.number)
      );
      return;
    }

    const fileId = photo?.file_id || document.file_id;
    const buffer = await downloadFile(fileId);
    const uploaded = await processImage(buffer, `p${startIndex + 1}`);
    const all = appendPages(chatId, uploaded);
    if (!all) return;

    // Albom (ko'p rasm) yuborilganda har bir rasmga javob bermaslik uchun har 5 bo'lakda bir xabar beramiz
    if (Math.floor(all.length / 5) > Math.floor(startIndex / 5)) {
      await sendMessage(
        chatId,
        `Qabul qilindi: <b>${all.length}</b> bo'lak. Tugagach saqlang:`,
        saveKeyboard(session.manhwaId, session.number)
      );
    }
  } catch (error) {
    console.error("media xatosi:", error.message);
    await sendMessage(chatId, `❌ Xatolik: ${escapeHtml(error.message)}`);
  }
}

async function saveChapter(chatId, manhwaId, number) {
  const session = getSession(chatId);
  const pages = session?.pages || [];
  if (!pages.length) {
    await sendMessage(chatId, "Hali fayl yuborilmagan. Avval PDF yoki rasmlarni yuboring.");
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
  await sendMessage(chatId, `✅ Bob ${number} saytga qo'shildi — ${pages.length} bo'lak. Saytda darhol ko'rinadi.`);
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
  if (action === "read" && rest.length === 1) {
    await showReadList(chatId, rest[0]);
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
    const hint = isAdmin(chatId)
      ? "Avval manhwa havolasini yuboring, so'ng «➕ Yangi bob yuklash» tugmasini bosing — shundan keyin PDF yoki rasmlarni yuborasiz."
      : "Manhwa havolasini yoki kodini yuboring.";
    await sendMessage(chatId, hint);
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