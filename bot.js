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

console.log(chalk.blue('🤖 Initializing Telegram Bot...'));

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
      console.log(chalk.green('✅ Created admin.json with default owner ID'));
    } catch (err) {
      console.error(chalk.red('Error creating admin.json:'), err);
    }
  } else {
    try {
      const raw = await fs.readFile(adminFilePath, 'utf8');
      adminIDs = JSON.parse(raw);
    } catch (err) {
      console.error(chalk.red('Error loading admin.json:'), err);
      adminIDs = defaultAdmins;
    }
  }
  console.log(chalk.blue('📥 Loaded Admin IDs:'), adminIDs);
};

let isShuttingDown = false;
let isAutoLoadRunning = false;

const runAutoLoad = async () => {
  if (isAutoLoadRunning || isShuttingDown) return;
  isAutoLoadRunning = true;

  try {
    console.log(chalk.cyan('⏱️ INITIATING AUTO-LOAD'));
    await autoLoadPairs();
    console.log(chalk.green('✅ AUTO-LOAD COMPLETED'));
  } catch (e) {
    console.error(chalk.red('❌ AUTO-LOAD FAILED:'), e);
  } finally {
    isAutoLoadRunning = false;
  }
};

const startAutoLoadLoop = () => {
  runAutoLoad();
  setInterval(runAutoLoad, 60 * 60 * 1000);
};

const gracefulShutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(chalk.yellow(`🛑 Received ${signal}. Shutting down gracefully...`));
  bot.stopPolling();
  console.log(chalk.green('✅ Bot stopped successfully'));
  process.exit(0);
};

// ========== SEND GROUP MESSAGE (STYLISH) ==========
const sendGroupMessage = async (chatId, replyToMessageId = null) => {
  try {
    const botInfo = await bot.getMe();
    const botUsername = botInfo.username;
    
    const message = `╭━━〔 🛡️ 𝙑𝙄𝙋 𝙎𝙀𝘾𝙐𝙍𝙀 〕━━╮\n➤ Use in DM 👇\n╰━━〔 🚀 𝙎𝙏𝘼𝙍𝙏 𝙉𝙊𝙒 〕━━╯`;

    const options = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 START NOW', url: `https://t.me/${botUsername}?start=pair` }]
        ]
      }
    };

    if (replyToMessageId) {
      options.reply_to_message_id = replyToMessageId;
    }

    return bot.sendMessage(chatId, message, options);
  } catch (error) {
    console.error(chalk.red('Error in sendGroupMessage:'), error);
  }
};

// ========== START COMMAND ==========
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

  console.log(chalk.green(`Received /start from ${chatId} (${isGroup ? 'Group' : 'Private'})`));

  if (isGroup) {
    return sendGroupMessage(chatId, msg.message_id);
  }

  try {
    await bot.sendPhoto(
      chatId,
      "https://i.postimg.cc/vBSV5xcw/file-00000000fad8820b868a07243e28de5d.png",
      {
        caption: `🪀 *𝘿𝘼𝙉𝙂𝙀𝙍𝙊𝙐𝙎 𝙈𝘿 𝘽𝙊𝙏💀*\n\n╔════════════════════╗\n ⤷ /pair <wa_number>\n ⤷ /unpair <wa_number>\n╚════════════════════╝\n\nWelcome! Use the commands above to manage your WhatsApp pairing.`,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "👑 Owner", url: "https://t.me/DangerousSeller" }]
          ]
        }
      }
    );
  } catch (error) {
    console.error(chalk.red('Error sending start message:'), error);
    bot.sendMessage(chatId, `🪀 *𝘿𝘼𝙉𝙂𝙀𝙍𝙊𝙐𝙎 𝙈𝘿 𝘽𝙊𝙏💀*\n\nWelcome! Use /pair to start.`, { parse_mode: 'Markdown' });
  }
});

// ========== PAIR COMMAND ==========
bot.onText(/\/pair(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
  const text = match[1]?.trim();

  if (isGroup) {
    return sendGroupMessage(chatId, msg.message_id);
  }

  if (!text) {
    userStates.set(userId, { step: 'awaiting_number' });
    return bot.sendMessage(chatId, 
      `🔐 *Please send your WhatsApp number*\n\nExample: /pair 923xxxxxxxxx\n\nOr just type: 923xxxxxxxxx`,
      { parse_mode: 'Markdown' }
    );
  }

  // Validation
  if (/[a-z]/i.test(text)) return bot.sendMessage(chatId, '❌ *Letters are not allowed.*', { parse_mode: 'Markdown' });
  if (!/^\d{7,15}$/.test(text)) return bot.sendMessage(chatId, '❌ *Invalid format.*', { parse_mode: 'Markdown' });
  if (text.startsWith('0')) return bot.sendMessage(chatId, '❌ *Numbers starting with 0 are not allowed.*', { parse_mode: 'Markdown' });

  const pairingFolder = path.join(__dirname, 'kingbadboitimewisher', 'pairing');
  if (!(await exists(pairingFolder))) await fs.mkdir(pairingFolder, { recursive: true });

  userStates.delete(userId);

  try {
    const startpairing = require('./pair.js');
    const Xreturn = text + "@s.whatsapp.net";
    await bot.sendMessage(chatId, '⏳ *Generating pairing code...*', { parse_mode: 'Markdown' });
    
    await startpairing(Xreturn);
    await sleep(5000);

    const pairingFile = path.join(pairingFolder, 'pairing.json');
    const cu = await fs.readFile(pairingFile, 'utf-8');
    const cuObj = JSON.parse(cu);
    
    return bot.sendMessage(chatId,
      `🔗 *Pairing Code for WhatsApp*\n\n` +
      `📝 *Code:* 👉 \`${cuObj.code}\` 👈\n\n` +
      `➡️ *Instructions:*\n` +
      `1. Open WhatsApp\n` +
      `2. Go to Settings → Linked Devices\n` +
      `3. Tap "Link a Device"\n` +
      `4. Enter this code`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error(chalk.red('PAIR COMMAND ERROR:'), error);
    bot.sendMessage(chatId, '❌ *Pairing service error.*', { parse_mode: 'Markdown' });
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
    // Process as pairing number
    bot.processText(msg, `/pair ${text}`);
  }
});

// ========== UNPAIR COMMAND ==========
bot.onText(/\/unpair(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1]?.trim();
  if (msg.chat.type !== 'private') return bot.sendMessage(chatId, '❌ Use in private chat.');

  try {
    if (!input) return bot.sendMessage(chatId, 'Example: /unpair 923xxxxxxxxx');
    
    const pairingPath = path.join(__dirname, 'kingbadboitimewisher', 'pairing');
    if (!(await exists(pairingPath))) return bot.sendMessage(chatId, 'No paired devices.');

    const entries = await fs.readdir(pairingPath, { withFileTypes: true });
    const matched = entries.find(entry => entry.isDirectory() && entry.name.includes(input));

    if (!matched) return bot.sendMessage(chatId, `No device found for *${input}*`, { parse_mode: 'Markdown' });

    await fs.rm(path.join(pairingPath, matched.name), { recursive: true, force: true });
    return bot.sendMessage(chatId, `✅ Device *${input}* deleted.`, { parse_mode: 'Markdown' });
  } catch (err) {
    bot.sendMessage(chatId, 'Error deleting device.');
  }
});

bot.on('polling_error', (error) => {
  if (error.code === 'ETELEGRAM' && error.message.includes('409 conflict')) {
    console.log(chalk.yellow('⚠️ Polling conflict, retrying...'));
  } else {
    console.error(chalk.red('Polling error:'), error.message);
  }
});

(async () => {
  await loadAdminIDs();
  startAutoLoadLoop();
  console.log(chalk.green('🤖 Telegram Bot is running and ready!'));
})();

process.on("uncaughtException", (err) => console.error(chalk.red('Uncaught Exception:'), err));
process.on("unhandledRejection", (err) => console.error(chalk.red('Unhandled Rejection:'), err));
process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
