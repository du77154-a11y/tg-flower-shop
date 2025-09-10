import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Telegraf, Markup } from 'telegraf';

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL || 'http://localhost:3000/web';
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error('Не найден BOT_TOKEN в .env / env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Кнопка открытия витрины
bot.start((ctx) => {
  return ctx.reply(
    'Цветочная витрина готова 🌸',
    Markup.keyboard([[Markup.button.webApp('Открыть витрину', WEB_APP_URL)]]).resize()
  );
});

// Приём заявки из мини-приложения
bot.on('message', async (ctx) => {
  const wa = ctx.message?.web_app_data;
  if (!wa?.data) return;
  try {
    const payload = JSON.parse(wa.data);
    if (payload.action === 'order' && payload.product) {
      const p = payload.product;
      await ctx.reply(`Заявка на букет:\n• ${p.title}\n• Цена: ${p.price} ₽`);
    } else {
      await ctx.reply('Получены данные, но формат не распознан 🤔');
    }
  } catch (e) {
    console.error(e);
    await ctx.reply('Не смог прочитать данные заявки 🙈');
  }
});

// --- HTTP + статика + API ---
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use('/web', express.static(path.join(__dirname, '..', 'web')));

app.get('/products', (_req, res) => {
  const filePath = path.join(__dirname, '..', 'data', 'products.json');
  try {
    const json = fs.readFileSync(filePath, 'utf8');
    res.type('application/json').send(json);
  } catch (e) {
    res.status(500).json({ error: 'Не удалось прочитать products.json' });
  }
});

app.get('/', (_req, res) => res.send('Bot & Web are running'));

// --- Режим запуска: webhook на Render, polling локально ---
const IS_RENDER = !!process.env.RENDER || !!process.env.RENDER_EXTERNAL_URL;

// адрес сервиса (Render даёт переменную RENDER_EXTERNAL_URL)
const SERVICE_URL =
  (process.env.RENDER_EXTERNAL_URL ||
    (process.env.WEB_APP_URL ? process.env.WEB_APP_URL.replace(/\/web$/, '') : ''))?.replace(/\/$/, '');

if (IS_RENDER && SERVICE_URL) {
  const hookPath = `/telegraf/${BOT_TOKEN}`;
  const hookUrl = `${SERVICE_URL}${hookPath}`;

  // Вешаем обработчик webhook в Express
  app.use(hookPath, bot.webhookCallback(hookPath));

  // Поднимаем HTTP
  app.listen(PORT, () => console.log('HTTP on', PORT));

  // Ставим вебхук и НЕ запускаем polling
  (async () => {
    try {
      await bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});
      await bot.telegram.setWebhook(hookUrl);
      console.log('Webhook set:', hookUrl);
    } catch (e) {
      console.error('Failed to set webhook:', e);
      process.exit(1);
    }
  })();
} else {
  // Локальная разработка — polling
  app.listen(PORT, () => console.log('HTTP on', PORT));
  (async () => {
    try {
      await bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});
      await bot.launch();
      console.log('Bot launched (polling)');
    } catch (e) {
      console.error(e);
    }
  })();
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));