# AniManxwa Telegram bot (v2) — Telegram → Sayt

Telegram'dan **PDF** (yoki rasmlar) yuborasiz → bot PDF'ni sahifalarga ajratib, rasmlarni olib, **bo'laklarga bo'lib** Cloudinary'ga yuklaydi → «✅ Saytga saqlash» bosilganda bob saytda paydo bo'ladi.

## Admin uchun ishlash tartibi

1. Botga manhwa **havolasi** yoki **kodini** yuboring.
2. «➕ Yangi bob yuklash (saytga)» tugmasini bosing, bob raqamini yozing.
3. **PDF** yuboring (bir nechta PDF/rasm yuborsangiz, ular tartib bilan birlashadi).
4. «✅ Saytga saqlash» ni bosing.

Oddiy foydalanuvchilar uchun eski rejim saqlangan: havola yuboradi → bob raqamini tanlaydi → sahifalar Telegram'ga tushadi.

## PDF qanday ishlanadi

- Sahifada butun sahifa kattaligidagi rasm bo'lsa — rasm **asl sifatida** ajratib olinadi.
- Aks holda (matn/vektor sahifa) sahifa `RENDER_WIDTH` kengligida rasm qilib chiziladi.
- Balandligi `SLICE_HEIGHT` (standart 1500 px) dan oshgan rasm teng bo'laklarga bo'linadi. `SMART_CUT=true` bo'lsa kesish chizma o'rtasidan emas, eng bo'sh qatordan o'tadi.
- `SLICE_HEIGHT=0` qilsangiz, bo'laklash o'chadi.

## O'rnatish (GitHub + Render)

1. `telegram-bot` papkasini GitHub repo'ga yuklang.
2. Render: **New → Web Service** → repo → **Root Directory**: `telegram-bot`
3. **Build Command**: `npm install` · **Start Command**: `npm start`
4. Node versiyasi: papkada `.node-version` (22) bor; kerak bo'lsa Render'da `NODE_VERSION=22` qo'shing.
5. **Environment** (`.env.example` dagi nomlar bilan):

| Nomi | Qiymati |
| --- | --- |
| `BOT_TOKEN` | @BotFather bergan token |
| `BASE44_TOKEN` | Dashboard → API → Create access token (Full access) |
| `ADMIN_IDS` | Sizning chat ID (botga `/start` yozsangiz ko'rsatadi) |
| `SLICE_HEIGHT` | `1500` (ixtiyoriy) |

## Muhim cheklovlar

- Telegram bot orqali **20 MB** gacha fayl yuklab olinadi. PDF kattaroq bo'lsa, uni bir necha qismga bo'lib yuboring (ular birlashib ketadi).
- PDF ishlanayotganda bot boshqa xabarlarga javob bermay turadi (katta PDF uchun 1–2 daqiqa).
- Jarayon xotirada saqlanadi: servis qayta ishga tushsa, yarim qolgan yuklashni boshidan boshlash kerak.
- Bob raqami saytda allaqachon bo'lsa, bot uni qabul qilmaydi (ikki marta qo'shilib ketmasligi uchun).
