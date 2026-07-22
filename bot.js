require('dotenv').config();
require('./setting/config');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const fs2 = require("fs")
const path = require('path');
const chalk = require('chalk');
const { sleep } = require('./utils');
const { BOT_TOKEN } = require('./token');
const { autoLoadPairs } = require('./autoload');
const axios = require("axios")

console.log(chalk.blue('🤖 Initializing DANGEROUS MD BOT...'));

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const adminFilePath = path.join(__dirname, 'kingbadboitimewisher', 'admin.json');
let adminIDs = [];

// Store user states for pairing flow
const userStates = new Map();

const exists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const loadAdminIDs = async () => {
  const ownerID = '7865301523';
  const defaultAdmins = [ownerID];

  if (!(await exists(adminFilePath))) {
    try {
      await fs.mkdir(path.dirname(adminFilePath), { recursive: true });
      await fs.writeFile(adminFilePath, JSON.stringify(defaultAdmins, null, 2));
      adminIDs = defaultAdmins;
    } catch (err) {}
  } else {
    try {
      const raw = await fs.readFile(adminFilePath, 'utf8');
      adminIDs = JSON.parse(raw);
    } catch (err) {
      adminIDs = defaultAdmins;
    }
  }
};

let isShuttingDown = false;
let isAutoLoadRunning = false;

const runAutoLoad = async () => {
  if (isAutoLoadRunning || isShuttingDown) return;
  isAutoLoadRunning = true;
  try {
    await autoLoadPairs();
  } catch (e) {} finally {
    isAutoLoadRunning = false;
  }
};

const gracefulShutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  bot.stopPolling();
  process.exit(0);
};

// ========== STYLISH UI HELPERS ==========
const getStylishStartMessage = (name) => {
  return `⚡ *WELCOME TO DANGEROUS MD BOT* ⚡\n\n` +
         `┏━━━━━━━━━━━━━━━━━━━━━━━━┓\n` +
         `┃  👤 *User:* ${name}\n` +
         `┃  🤖 *Status:* Online & Secure\n` +
         `┃  🛠️ *Version:* 2.0.0\n` +
         `┗━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
         `*AVAILABLE COMMANDS:*\n` +
         `┌──────────────────────┐\n` +
         `│ ⤷ /pair <number>\n` +
         `│ ⤷ /unpair <number>\n` +
         `│ ⤷ /help - View more\n` +
         `└──────────────────────┘\n\n` +
         `_Powered by SHADOW OFFICIAL_`;
};

const PHOTO_URL = "https://i.postimg.cc/vBSV5xcw/file-00000000fad8820b868a07243e28de5d.png";

// ========== START COMMAND ==========
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'User';
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

  if (isGroup) {
    const botInfo = await bot.getMe();
    return bot.sendMessage(chatId, `╭━━〔 🛡️ 𝙑𝙄𝙋 𝙎𝙀𝘾𝙐𝙍𝙀 〕━━╮\n➤ Use in DM 👇\n╰━━〔 🚀 𝙎𝙏𝘼𝙍𝙏 𝙉𝙊𝙒 〕━━╯`, {
      reply_markup: {
        inline_keyboard: [[{ text: '🚀 START IN DM', url: `https://t.me/${botInfo.username}?start=start` }]]
      }
    });
  }

  try {
    await bot.sendPhoto(chatId, PHOTO_URL, {
      caption: getStylishStartMessage(firstName),
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: "👑 Owner", url: "https://t.me/DangerousSeller" }, { text: "📢 Channel", url: "https://whatsapp.com/channel/0029Vb8XwkCA89MpQ00xrw20" }],
          [{ text: "🚀 Start Pairing", callback_data: "start_pairing" }]
        ]
      }
    });
  } catch (error) {
    bot.sendMessage(chatId, getStylishStartMessage(firstName), { parse_mode: 'Markdown' });
  }
});

// ========== CALLBACK QUERY HANDLER ==========
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  if (data === "start_pairing") {
    bot.sendMessage(chatId, "🔐 *Please send your WhatsApp number with country code.*\n\nExample: `923xxxxxxxxx`", { parse_mode: 'Markdown' });
    userStates.set(callbackQuery.from.id, { step: 'awaiting_number' });
  }
  bot.answerCallbackQuery(callbackQuery.id);
});

// ========== PAIR COMMAND ==========
bot.onText(/\/pair(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = match[1]?.trim();

  if (!text) {
    userStates.set(userId, { step: 'awaiting_number' });
    return bot.sendMessage(chatId, "🔐 *Send your WhatsApp number (e.g., 923xxxxxxxxx)*", { parse_mode: 'Markdown' });
  }

  if (!/^\d{7,15}$/.test(text)) return bot.sendMessage(chatId, "❌ *Invalid format.*");

  try {
    await bot.sendMessage(chatId, "⏳ *Generating pairing code...*");
    const startpairing = require('./pair.js');
    await startpairing(text + "@s.whatsapp.net");
    await sleep(5000);

    const pairingFile = path.join(__dirname, 'kingbadboitimewisher', 'pairing', 'pairing.json');
    const cu = await fs.readFile(pairingFile, 'utf-8');
    const { code } = JSON.parse(cu);
    
    bot.sendMessage(chatId, `✅ *Your Pairing Code:* \`${code}\`\n\n1. Open WhatsApp\n2. Linked Devices → Link a Device\n3. Enter this code`, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(chatId, "❌ *Pairing error.*");
  }
});

// ========== TEXT MESSAGE HANDLER ==========
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  if (msg.chat.type !== 'private' || !text || text.startsWith('/')) return;
  
  const userState = userStates.get(userId);
  if (userState && userState.step === 'awaiting_number') {
    userStates.delete(userId);
    bot.processText(msg, `/pair ${text}`);
  }
});

bot.on('polling_error', (error) => {});

(async () => {
  await loadAdminIDs();
  runAutoLoad();
  console.log(chalk.green('🤖 DANGEROUS MD BOT is running!'));
})();

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
