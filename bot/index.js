import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Telegraf, Markup } from 'telegraf';

const BOT_TOKEN=process.env.BOT_TOKEN;
const WEB_APP_URL=process.env.WEB_APP_URL||'http://localhost:3000/web';
const PORT=process.env.PORT||3000;

if(!BOT_TOKEN){ console.error('Не найден BOT_TOKEN в .env'); process.exit(1); }

const bot=new Telegraf(BOT_TOKEN);

bot.start((ctx)=>{
  return ctx.reply('Цветочная витрина готова 🌸', Markup.keyboard([[Markup.button.webApp('Открыть витрину', WEB_APP_URL)]]).resize());
});

bot.on('message', async (ctx)=>{
  const wa=ctx.message?.web_app_data;
  if(!wa?.data) return;
  try{
    const payload=JSON.parse(wa.data);
    if(payload.action==='order' && payload.product){
      const p=payload.product;
      await ctx.reply(`Заявка на букет:\n• ${p.title}\n• Цена: ${p.price} ₽`);
    }else{
      await ctx.reply('Получены данные, но формат не распознан 🤔');
    }
  }catch(e){
    console.error(e);
    await ctx.reply('Не смог прочитать данные заявки 🙈');
  }
});

const app=express();
const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);

app.use('/web', express.static(path.join(__dirname,'..','web')));

app.get('/products',(req,res)=>{
  const filePath=path.join(__dirname,'..','data','products.json');
  try{
    const json=fs.readFileSync(filePath,'utf8');
    res.type('application/json').send(json);
  }catch(e){
    res.status(500).json({error:'Не удалось прочитать products.json'});
  }
});

app.get('/',(_req,res)=>res.send('Bot & Web are running'));

app.listen(PORT,()=>console.log('HTTP on',PORT));
bot.launch().then(()=>console.log('Bot launched'));

process.once('SIGINT',()=>bot.stop('SIGINT'));
process.once('SIGTERM',()=>bot.stop('SIGTERM'));