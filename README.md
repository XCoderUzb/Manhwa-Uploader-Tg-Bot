# AniManxwa Telegram bot

Manhwa havolasini yoki kodini yuborasiz → bot boblar raqamlarini inline tugmalar qilib chiqaradi → raqamni bosasiz → sahifalar shu yerga tushadi. Admin uchun «➕ Yangi bob qo'shish» tugmasi ham bor.

Bu alohida kichik servis (Node.js). Saytning o'zi bilan bog'liq emas: GitHub'ga alohida repo qilib qo'yib, Render'da ishga tushirish mumkin. Kutubxonalar kerak emas (Node 18+ yetadi).

## 1. Bot tokenini olish

1. Telegram'da **@BotFather** ga yozing → `/newbot` → nom va username kiriting.
2. Bergan tokenni saqlab qo'ying (masalan `123456:AAE...`).

## 2. Base44 tokenini olish

1. Sayt muharririda **Dashboard → API** bo'limini oching.
2. **Create access token** tugmasini bosing.
3. **Access**: shu ilova (AniManxwa) tanlangan bo'lsin. **Permission**: **Full access** (bob qo'shish uchun kerak).
4. Tokenni ko'chirib oling (bu `BASE44_TOKEN`).

## 3. GitHub + Render

1. Bu papkani (`telegram-bot`) GitHub repo'ga yuklang.
2. Render'da: **New → Web Service** (yoki **Background Worker**) → repo'ni tanlang.
3. **Root Directory**: `telegram-bot`
4. **Build Command**: `npm install` · **Start Command**: `npm start`
5. **Environment** bo'limida o'zgaruvchilarni qo'shing (`.env.example` faylidagi nomlar bilan):

| Nomi | Qiymati |
| --- | --- |
| `BOT_TOKEN` | BotFather bergan token |
| `BASE44_TOKEN` | Dashboard → API'dan olingan token |
| `BASE44_APP_ID` | `6ac34a8ddcf74b8abf6b0872` |
| `ADMIN_IDS` | Sizning chat ID (pastga qarang) |
| `PAGE_SEND_MODE` | `photo` (albom) yoki `document` (siqilmaydi) |

6. Deploy tugagach bot avtomatik ishga tushadi (logda `Bot ishga tushdi: @...` yozuvi chiqadi).

## 4. Chat ID (admin huquqi)

1. Telegram'da botga `/start` yozing — javobning pastida `Sizning chat ID: ...` ko'rsatiladi.
2. Shu raqamni Render'dagi `ADMIN_IDS` ga qo'ying va qayta deploy qiling.
3. Shundan keyin botda «➕ Yangi bob qo'shish» tugmasi chiqadi.

## Foydalanish

**O'quvchi:** botga havola (`https://animanxwa.base44.app/slug`) yoki kodni yuboradi → boblar raqamlari chiqadi → raqamni bosadi → sahifalar tushadi.

**Admin (yangi bob):** havolani yuboradi → «➕ Yangi bob qo'shish» → bob raqamini yozadi → sahifalarni yuboradi → «✅ Saqlash». Sahifalar Cloudinary'ga yuklanadi va bob saytda darhol paydo bo'ladi.

## Eslatmalar

- Sahifalarni **fayl** (📎 → Fayl) qilib yuboring — Telegram oddiy rasm sifatida yuborganda ularni siqadi va sifat pasayadi.
- Bob holati server xotirasida saqlanadi; servis qayta ishga tushsa, yarim qolgan qo'shishni boshidan boshlash kerak.
- Havolalar `/oqish/<raqam>` ko'rinishida ham ishlaydi — bot raqamni o'zi ajratib oladi.
- Saytda sahifalar bo'laklarga bo'linadi (manga uchun bo'linmaydi); bot esa rasmlarni qanday yuborgan bo'lsangiz shundayligicha yuklaydi.