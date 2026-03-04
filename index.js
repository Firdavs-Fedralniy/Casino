import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import 'dotenv/config';
import http from "http";

const TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const ADMINS_FILE = "./admins.json";
const ADMIN_CODE = "998996560701";

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
const waitingForCode = new Set();

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
// клавиатуры
// ------------------
const modeKeyboard = {
  inline_keyboard: [
    [
      { text: "🎰 Слот", callback_data: "mode_slot" },
      { text: "🎲 Кубик", callback_data: "mode_cube" },
    ],
    [
      { text: "🏀 Баскетбол", callback_data: "mode_basket" },
      { text: "🎯 Дартс", callback_data: "mode_darts" },
    ],
    [
      { text: "🎳 Боулинг", callback_data: "mode_bowling" },
      { text: "⚽️ Футбол", callback_data: "mode_football" },
    ],
  ],
};

const modeNames = {
  slot: "🎰 Слот",
  cube: "🎲 Кубик",
  basket: "🏀 Баскетбол",
  darts: "🎯 Дартс",
  bowling: "🎳 Боулинг",
  football: "⚽️ Футбол",
};

// ------------------
// /start — в группе включает бота и показывает меню выбора режима
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
  const currentMode = mode.get(chatId);
  const modeText = currentMode ? `Текущий режим: ${modeNames[currentMode]}` : "Режим не выбран";

  bot.sendMessage(
    chatId,
    `✅ Бот включён!\n${modeText}\n\nВыбери режим игры:`,
    { reply_markup: modeKeyboard }
  );
});

// ------------------
// /mode — показывает кнопки выбора режима
// ------------------
bot.onText(/\/mode/, async (msg) => {
  if (!botEnabled || msg.chat.type === "private") return;

  const chatId = msg.chat.id;
  const admins = await getAdmins(chatId);
  if (!isAdmin(admins, msg.from.id)) return;

  const currentMode = mode.get(chatId);
  const modeText = currentMode ? `Текущий режим: ${modeNames[currentMode]}` : "Режим не выбран";

  bot.sendMessage(
    chatId,
    `🎮 ${modeText}\n\nВыбери новый режим:`,
    { reply_markup: modeKeyboard }
  );
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
// /admin — приватный чат
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
// обработка ввода кода в приватном чате
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
// обработка нажатий на кнопки
// ------------------
bot.on("callback_query", async (query) => {
  const msg = query.message;
  const chatId = msg.chat.id;
  const userId = query.from.id;

  // Проверяем, что это групповой чат и бот включён
  if (msg.chat.type === "private") {
    return bot.answerCallbackQuery(query.id, { text: "❌ Это только для групп" });
  }

  if (!botEnabled) {
    return bot.answerCallbackQuery(query.id, { text: "❌ Бот выключен. Напишите /start" });
  }

  // Проверяем права — только админ группы может менять режим
  try {
    const admins = await getAdmins(chatId);
    if (!isAdmin(admins, userId)) {
      return bot.answerCallbackQuery(query.id, { text: "❌ Только администраторы могут менять режим" });
    }
  } catch (e) {
    return bot.answerCallbackQuery(query.id, { text: "❌ Ошибка проверки прав" });
  }

  const data = query.data;

  const modeMap = {
    mode_slot: "slot",
    mode_cube: "cube",
    mode_basket: "basket",
    mode_darts: "darts",
    mode_bowling: "bowling",
    mode_football: "football",
  };

  if (modeMap[data]) {
    const selectedMode = modeMap[data];
    mode.set(chatId, selectedMode);

    // Отвечаем на callback (убираем "часики" на кнопке)
    bot.answerCallbackQuery(query.id, { text: `✅ Режим ${modeNames[selectedMode]} включён!` });

    // Редактируем сообщение с кнопками — показываем выбранный режим
    bot.editMessageText(
      `✅ Режим игры выбран: ${modeNames[selectedMode]}\n\nХочешь сменить? Нажми кнопку ниже:`,
      {
        chat_id: chatId,
        message_id: msg.message_id,
        reply_markup: modeKeyboard,
      }
    );
  }
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

  if (currentMode === "football" && (msg.dice.emoji === "⚽" || msg.dice.emoji === "⚽️") && value >= 5)
    notify(`⚽️ Игрок ${user.first_name} забил гол`);
});

console.log("🤖 Бот запущен");

http.createServer((req, res) => res.end("ok")).listen(PORT, () => {
  console.log("Server running on port", PORT);
});