import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import 'dotenv/config';
import http from "http";

const TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const ADMINS_FILE = "./admins.json";
const ADMIN_CODE = "998996560701"; // ← сюда вставь свой код

if (!TOKEN) {
  console.error("❌ BOT_TOKEN не найден!");
  process.exit(1);
}

// ------------------
// load admins
// ------------------
let allowedAdmins = new Set();

function loadAdmins() {
  try {
    const data = fs.readFileSync(ADMINS_FILE, "utf8");
    allowedAdmins = new Set(JSON.parse(data));
    console.log("✅ Admins loaded:", [...allowedAdmins]);
  } catch (e) {
    allowedAdmins = new Set();
    console.log("⚠️ No admins file found, starting empty");
  }
}

function saveAdmins() {
  fs.writeFileSync(ADMINS_FILE, JSON.stringify([...allowedAdmins]));
}

loadAdmins();

// ------------------
// bot init
// ------------------
const bot = new TelegramBot(TOKEN, { polling: true });

let botEnabled = false;
const mode = new Map();
const waitingForCode = new Set(); // пользователи ожидающие ввода кода

// ------------------
// utils
// ------------------
async function getAdmins(chatId) {
  return await bot.getChatAdministrators(chatId);
}

function isAdmin(admins, userId) {
  return admins.some(a => a.user.id === userId);
}

function getGroupLink(chat) {
  if (chat.username) return `https://t.me/${chat.username}`;
  return `tg://openmessage?chat_id=${chat.id}`;
}

function getMessageLink(chat, messageId) {
  if (chat.username) return `https://t.me/${chat.username}/${messageId}`;
  return `tg://openmessage?chat_id=${chat.id}&message_id=${messageId}`;
}

// ------------------
// /start
// ------------------
bot.onText(/\/start/, async (msg) => {
  if (msg.chat.type === "private") {
    return bot.sendMessage(
      msg.chat.id,
      "👋 Добро пожаловать!\n\n" +
      "📌 Чтобы стать админом бота и получать уведомления — напишите /admin\n" +
      "📌 Чтобы использовать бота в группе — добавьте его туда и напишите /start в группе."
    );
  }

  const chatId = msg.chat.id;
  const admins = await getAdmins(chatId);
  if (!isAdmin(admins, msg.from.id)) return;

  botEnabled = true;
  mode.set(chatId, "slot");
  bot.sendMessage(chatId, "✅ Бот включён. Режим: slot");
});

// ------------------
// /admin
// ------------------
bot.onText(/\/admin/, async (msg) => {
  if (msg.chat.type !== "private") return;

  const userId = msg.from.id;

  if (allowedAdmins.has(userId)) {
    return bot.sendMessage(msg.chat.id, "✅ Ты уже являешься админом бота.");
  }

  waitingForCode.add(userId);
  bot.sendMessage(msg.chat.id, "🔐 Введи секретный код:");
});

// ------------------
// обработка всех текстовых сообщений (для ввода кода)
// ------------------
bot.on("message", async (msg) => {
  if (msg.chat.type !== "private") return;
  if (!msg.text || msg.text.startsWith("/")) return;

  const userId = msg.from.id;

  if (waitingForCode.has(userId)) {
    waitingForCode.delete(userId);

    if (msg.text.trim() === ADMIN_CODE) {
      allowedAdmins.add(userId);
      saveAdmins();
      return bot.sendMessage(
        msg.chat.id,
        "✅ Код верный! Ты добавлен в список админов.\nТеперь я буду присылать тебе уведомления о выигрышах."
      );
    } else {
      return bot.sendMessage(msg.chat.id, "❌ Неверный код. Попробуй снова — напиши /admin");
    }
  }
});

// ------------------
// /off
// ------------------
bot.onText(/\/off/, async (msg) => {
  if (msg.chat.type === "private") return;
  const chatId = msg.chat.id;
  const admins = await getAdmins(chatId);
  if (!isAdmin(admins, msg.from.id)) return;
  botEnabled = false;
  bot.sendMessage(chatId, "🛑 Бот выключен");
});

// ------------------
// modes
// ------------------
bot.onText(/\/cube/, async (msg) => {
  if (!botEnabled || msg.chat.type === "private") return;
  const chatId = msg.chat.id;
  const admins = await getAdmins(chatId);
  if (!isAdmin(admins, msg.from.id)) return;
  mode.set(chatId, "cube");
  bot.sendMessage(chatId, "🎲 Режим КУБИКА включён");
});

bot.onText(/\/slot/, async (msg) => {
  if (!botEnabled || msg.chat.type === "private") return;
  const chatId = msg.chat.id;
  const admins = await getAdmins(chatId);
  if (!isAdmin(admins, msg.from.id)) return;
  mode.set(chatId, "slot");
  bot.sendMessage(chatId, "🎰 Режим СЛОТА включён");
});

bot.onText(/\/basket/, async (msg) => {
  if (!botEnabled || msg.chat.type === "private") return;
  const chatId = msg.chat.id;
  const admins = await getAdmins(chatId);
  if (!isAdmin(admins, msg.from.id)) return;
  mode.set(chatId, "basket");
  bot.sendMessage(chatId, "🏀 Режим Баскетбола включён");
});

bot.onText(/\/darts/, async (msg) => {
  if (!botEnabled || msg.chat.type === "private") return;
  const chatId = msg.chat.id;
  const admins = await getAdmins(chatId);
  if (!isAdmin(admins, msg.from.id)) return;
  mode.set(chatId, "darts");
  bot.sendMessage(chatId, "🎯 Режим Дартса включён");
});

bot.onText(/\/bowling/, async (msg) => {
  if (!botEnabled || msg.chat.type === "private") return;
  const chatId = msg.chat.id;
  const admins = await getAdmins(chatId);
  if (!isAdmin(admins, msg.from.id)) return;
  mode.set(chatId, "bowling");
  bot.sendMessage(chatId, "🎳 Режим Боулинга включён");
});

bot.onText(/\/football/, async (msg) => {
  if (!botEnabled || msg.chat.type === "private") return;
  const chatId = msg.chat.id;
  const admins = await getAdmins(chatId);
  if (!isAdmin(admins, msg.from.id)) return;
  mode.set(chatId, "football");
  bot.sendMessage(chatId, "⚽️ Режим Футбол включён");
});

// ------------------
// dice
// ------------------
bot.on("dice", async (msg) => {
  if (!botEnabled) return;

  const chatId = msg.chat.id;
  const currentMode = mode.get(chatId);
  const value = msg.dice.value;
  const user = msg.from;

  const userLink = user.username ? `https://t.me/${user.username}` : `tg://user?id=${user.id}`;
  const groupLink = getGroupLink(msg.chat);
  const messageLink = getMessageLink(msg.chat, msg.message_id);

  const notify = (text) => {
    for (const adminId of allowedAdmins) {
      bot.sendMessage(adminId, `🚨 В группе "${msg.chat.title}"\n${text}\n\n🔗 Игрок: ${userLink}\n🔗 Группа: ${groupLink}\n🔗 Сообщение: ${messageLink}`).catch(() => {});
    }
  };

  if (currentMode === "slot" && msg.dice.emoji === "🎰" && value === 64)
    notify(`🎰 Игрок ${user.first_name} выбил 777`);

  if (currentMode === "cube" && msg.dice.emoji === "🎲" && value === 6)
    notify(`🎲 Игрок ${user.first_name} выбил 6`);

  if (currentMode === "basket" && msg.dice.emoji === "🏀" && value === 5)
    notify(`🏀 Игрок ${user.first_name} попал точно в кольцо`);

  if (currentMode === "darts" && msg.dice.emoji === "🎯" && value === 6)
    notify(`🎯 Игрок ${user.first_name} попал в яблочко`);

  if (currentMode === "bowling" && msg.dice.emoji === "🎳" && value === 6)
    notify(`🎳 Игрок ${user.first_name} сбил все кегли`);

  if (currentMode === "football" && (msg.dice.emoji === "⚽" || msg.dice.emoji === "⚽️") && value >= 4)
    notify(`⚽️ Игрок ${user.first_name} забил гол`);
});

console.log("🤖 Бот запущен");

http.createServer((req, res) => res.end("ok")).listen(PORT, () => {
  console.log("Server running on port", PORT);
});