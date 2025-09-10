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

// ======== БОТ ========
bot.start((ctx) =>
  ctx.reply(
    'Цветочная витрина готова 🌸',
    Markup.keyboard([[Markup.button.webApp('Открыть витрину', WEB_APP_URL)]]).resize()
  )
);

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

// ======== HTTP ========
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ВАЖНО: JSON-парсер ДО webhook
app.use(express.json());

// Статика и API
app.use('/web', express.static(path.join(__dirname, '..', 'web')));
app.get('/products', (_req, res) => {
  const filePath = path.join(__dirname, '..', 'data', 'products.json');
  try {
    const json = fs.readFileSync(filePath, 'utf8');
    res.type('application/json').send(json);
  } catch {
    res.status(500).json({ error: 'Не удалось прочитать products.json' });
  }
});
app.get('/', (_req, res) => res.send('Bot & Web are running'));

// ======== WEBHOOK на Render, POLLING локально ========
const IS_RENDER = !!process.env.RENDER || !!process.env.RENDER_EXTERNAL_URL;
const SERVICE_URL =
  (process.env.RENDER_EXTERNAL_URL ||
    (process.env.WEB_APP_URL ? process.env.WEB_APP_URL.replace(/\/web$/, '') : '')).replace(/\/$/, '');

if (IS_RENDER && SERVICE_URL) {
  const hookPath = `/telegraf/${BOT_TOKEN}`;
  const hookUrl = `${SERVICE_URL}${hookPath}`;

  // Обработчик webhook (POST) и ответ на GET (чтобы не получить 404)
  app.use(hookPath, bot.webhookCallback(hookPath));
  app.get(hookPath, (_req, res) => res.status(200).send('ok'));

  app.listen(PORT, () => console.log('HTTP on', PORT));

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