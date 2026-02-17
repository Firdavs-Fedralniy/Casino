import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import http from "http";

// ------------------
// constants
// ------------------
const TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const ADMINS_FILE = "./admins.json";

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
    const arr = JSON.parse(data);
    allowedAdmins = new Set(arr);
    console.log("✅ Admins loaded:", arr);
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
  if (chat.username) {
    return `https://t.me/${chat.username}/${messageId}`;
  }
  return `tg://openmessage?chat_id=${chat.id}&message_id=${messageId}`;
}

// ------------------
// /start
// ------------------
bot.onText(/\/start/, async (msg) => {
  if (msg.chat.type === "private") {
    allowedAdmins.add(msg.from.id);
    saveAdmins();

    return bot.sendMessage(
      msg.chat.id,
      "Привет! Ты добавлен в список админов. Теперь я буду присылать уведомления."
    );
  }

  // group
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const admins = await getAdmins(chatId);
  if (!isAdmin(admins, userId)) return;

  botEnabled = true;
  mode.set(chatId, "slot"); // default mode
  allowedAdmins.add(userId);
  saveAdmins();

  bot.sendMessage(chatId, "✅ Бот включён. Админ добавлен. Режим: slot");
});

// ------------------
// /off
// ------------------
bot.onText(/\/off/, async (msg) => {
  if (msg.chat.type === "private") return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const admins = await getAdmins(chatId);
  if (!isAdmin(admins, userId)) return;

  botEnabled = false;
  bot.sendMessage(chatId, "🛑 Бот выключен");
});

// ------------------
// modes
// ------------------
bot.onText(/\/cube/, async (msg) => {
  if (!botEnabled || msg.chat.type === "private") return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const admins = await getAdmins(chatId);
  if (!isAdmin(admins, userId)) return;

  mode.set(chatId, "cube");
  bot.sendMessage(chatId, "🎲 Режим КУБИКА включён");
});

bot.onText(/\/slot/, async (msg) => {
  if (!botEnabled || msg.chat.type === "private") return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const admins = await getAdmins(chatId);
  if (!isAdmin(admins, userId)) return;

  mode.set(chatId, "slot");
  bot.sendMessage(chatId, "🎰 Режим СЛОТА включён");
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
  const userLink = user.username
    ? `https://t.me/${user.username}`
    : `tg://user?id=${user.id}`;

  const groupLink = getGroupLink(msg.chat);
  const messageLink = getMessageLink(msg.chat, msg.message_id);

  if (currentMode === "slot" && msg.dice.emoji === "🎰") {
  if (value === 64) {

    // 🎁 ВЫДАЧА ПОДАРКА (777)
    fetch("http://localhost:8000/win777", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: user.id
      })
    }).catch(() => {});

    // 🚨 УВЕДОМЛЕНИЕ АДМИНАМ
    for (const adminId of allowedAdmins) {
      bot.sendMessage(
        adminId,
        `🚨 В группе "${msg.chat.title}"\n🎰 Игрок ${user.first_name} выбил 777\n\n🔗 Ссылка на игрока: ${userLink}\n🔗 Ссылка на группе: ${groupLink}\n🔗 Ссылка на сообщение: ${messageLink}`
      ).catch(() => {});
    }
  }
}


  // CUBE
  if (currentMode === "cube" && msg.dice.emoji === "🎲") {
    if (value === 6) {
      for (const adminId of allowedAdmins) {
        bot.sendMessage(
          adminId,
          `🚨 В группе "${msg.chat.title}"\n🎲 Игрок ${user.first_name} выбил 6\n\n🔗 Ссылка на игрока: ${userLink}\n🔗 Ссылка на группе: ${groupLink}\n🔗 Ссылка на сообщение: ${messageLink}`
        ).catch(() => {});
      }
    }
  }
});

console.log("🤖 Бот запущен");

// ------------------
// keep server awake (optional)
// ------------------
http
  .createServer((req, res) => {
    res.end("ok");
  })
  .listen(PORT, () => {
    console.log("Server running on port", PORT);
  });
 