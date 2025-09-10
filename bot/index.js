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

// ===== ДЕБАГ: лог каждого апдейта из Telegraf =====
bot.use(async (ctx, next) => {
  try {
    console.log('Update via Telegraf:', {
      type: ctx.updateType,
      text: ctx.message?.text,
      chat: ctx.chat?.id,
      hasWebAppData: !!ctx.message?.web_app_data
    });
  } catch {}
  return next();
});

bot.catch((err, ctx) => {
  console.error('Telegraf error for update', ctx.update?.update_id, err);
});

// ==== Хэндлеры бота ====
bot.start((ctx) =>
  ctx.reply(
    'Цветочная витрина готова 🌸',
    Markup.keyboard([[Markup.button.webApp('Открыть витрину', WEB_APP_URL)]]).resize()
  )
);

// ДЕБАГ: отвечаем на любой текст (чтобы точно увидеть реакцию)
bot.on('text', (ctx) => ctx.reply('Принял текст: ' + (ctx.message?.text || '')));

// Заявка из мини-приложения
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

// ===== HTTP =====
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ДЕБАГ: лог каждого HTTP-запроса
app.use((req, _res, next) => {
  console.log('HTTP', req.method, req.path, 'ua=', req.headers['user-agent']);
  next();
});

// ВАЖНО: парсеры до вебхука
app.use(express.json({ type: ['application/json', 'text/plain', 'application/x-www-form-urlencoded'] }));
app.use(express.urlencoded({ extended: true }));

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

// ===== Режимы: webhook (Render) / polling (локально) =====
const IS_RENDER = !!process.env.RENDER || !!process.env.RENDER_EXTERNAL_URL;
const SERVICE_BASE =
  (process.env.RENDER_EXTERNAL_URL ||
    (process.env.WEB_APP_URL ? process.env.WEB_APP_URL.replace(/\/web$/, '') : '') ||
    '').replace(/\/$/, '');

if (IS_RENDER && SERVICE_BASE) {
  // --- WEBHOOK (Render) ---
  const hookPath = `/telegraf/${BOT_TOKEN}`;
  const hookUrl = `${SERVICE_BASE}${hookPath}`;

  // ЯВНЫЙ обработчик POST вебхука с логированием тела:
  app.post(hookPath, async (req, res) => {
    try {
      console.log('Webhook POST body keys:', req.body ? Object.keys(req.body) : 'NO BODY');
      // прокидываем апдейт в Telegraf
      await bot.handleUpdate(req.body);
      res.status(200).send('ok');
    } catch (err) {
      console.error('Webhook handler error:', err);
      res.status(200).send('ok'); // отвечаем 200, чтобы Telegram не ретраил бесконечно
    }
  });

  // Ответим 200 на GET того же пути (проверка наличия)
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
  // --- POLLING (локально) ---
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

// Не вызываем bot.stop() в webhook-режиме
process.once('SIGINT', () => process.exit(0));
process.once('SIGTERM', () => process.exit(0));
