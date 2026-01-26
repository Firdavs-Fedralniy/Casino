import express from "express";
import TelegramBot from "node-telegram-bot-api";

// --- CONFIG ---
const TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL; // https://your-replit-domain.repl.co
const PORT = process.env.PORT || 5000;

if (!TOKEN) {
  console.error("❌ BOT_TOKEN не найден!");
  process.exit(1);
}

if (!WEBHOOK_URL) {
  console.error("❌ WEBHOOK_URL не найден!");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN);

// ---------- bot logic ----------
let botEnabled = false;
const mode = new Map();
const allowedAdmins = new Set();

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

// ---------- /start ----------
bot.onText(/\/start/, async (msg) => {
  if (msg.chat.type === "private") {
    allowedAdmins.add(msg.from.id);
    return bot.sendMessage(msg.chat.id, "Привет! Я буду отправлять тебе уведомления из группы.");
  }

  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const admins = await getAdmins(chatId);
  if (!isAdmin(admins, userId)) return;

  allowedAdmins.add(userId);

  botEnabled = true;
  bot.sendMessage(chatId, "✅ Бот включён. Админ может выбрать режим:\n/cube\n/slot");
});

// ---------- /off ----------
bot.onText(/\/off/, async (msg) => {
  if (msg.chat.type === "private") return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const admins = await getAdmins(chatId);
  if (!isAdmin(admins, userId)) return;

  botEnabled = false;
  bot.sendMessage(chatId, "🛑 Бот выключен");
});

// ---------- /cube ----------
bot.onText(/\/cube/, async (msg) => {
  if (!botEnabled || msg.chat.type === "private") return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const admins = await getAdmins(chatId);
  if (!isAdmin(admins, userId)) return;

  mode.set(chatId, "cube");
  bot.sendMessage(chatId, "🎲 Режим КУБИКА включён");
});

// ---------- /slot ----------
bot.onText(/\/slot/, async (msg) => {
  if (!botEnabled || msg.chat.type === "private") return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const admins = await getAdmins(chatId);
  if (!isAdmin(admins, userId)) return;

  mode.set(chatId, "slot");
  bot.sendMessage(chatId, "🎰 Режим СЛОТА включён");
});

// ---------- dice ----------
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

  // SLOT
  if (currentMode === "slot" && msg.dice.emoji === "🎰") {
    if (value === 64) {
      const admins = await getAdmins(chatId);

      for (const admin of admins) {
        if (!allowedAdmins.has(admin.user.id)) continue;

        bot.sendMessage(
          admin.user.id,
          `🚨 В группе "${msg.chat.title}"\n🎰 Игрок ${user.first_name} выбил 777\n\n🔗 Ссылка на игрока: ${userLink}\n🔗 Ссылка на группу: ${groupLink}\n🔗 Ссылка на сообщение: ${messageLink}`
        ).catch(() => {});
      }
    }
  }

  // CUBE
  if (currentMode === "cube" && msg.dice.emoji === "🎲") {
    if (value === 6) {
      const admins = await getAdmins(chatId);

      for (const admin of admins) {
        if (!allowedAdmins.has(admin.user.id)) continue;

        bot.sendMessage(
          admin.user.id,
          `🚨 В группе "${msg.chat.title}"\n🎲 Игрок ${user.first_name} выбил 6\n\n🔗 Ссылка на игрока: ${userLink}\n🔗 Ссылка на группу: ${groupLink}\n🔗 Ссылка на сообщение: ${messageLink}`
        ).catch(() => {});
      }
    }
  }
});

console.log("🤖 Бот запущен на webhook");

// --- WEBHOOK SETUP ---
bot.setWebHook(`${WEBHOOK_URL}/bot${TOKEN}`);

// --- EXPRESS SERVER ---
const app = express();
app.use(express.json());

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("ok");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
