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
const slotSubMode = new Map();
const slotTrigger = new Map();
const perebivMinutes = new Map();
const lastJackpot = new Map();

// --- перебив сообщений ---
const msgPerebivMinutes = new Map();  // минуты для перебива сообщений
const lastMsg = new Map();            // { userId, firstName, username, timeoutId }
const waitingForMsgMinutes = new Set();

const waitingForCode = new Set();
const waitingForMinutes = new Set();

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
// Slot trigger values
// ------------------
const triggerValues = {
  "777":   64,
  "bar":   1,
  "lemon": 43,
  "berry": 22,
};

const allWinValues = new Set([1, 22, 43, 64]);

const triggerNames = {
  "777":   "7️⃣7️⃣7️⃣ 777",
  "bar":   "🅱️ BAR BAR BAR",
  "lemon": "🍋 Лимон Лимон Лимон",
  "berry": "🍒 Ежевика Ежевика Ежевика",
  "all":   "🎰 Все комбинации",
};

function getTriggerNameByValue(val) {
  for (const [key, v] of Object.entries(triggerValues)) {
    if (v === val) return triggerNames[key];
  }
  return "🎰 Джекпот";
}

const modeNames = {
  slot:     "🎰 Слот",
  cube:     "🎲 Кубик",
  basket:   "🏀 Баскетбол",
  darts:    "🎯 Дартс",
  bowling:  "🎳 Боулинг",
  football: "⚽️ Футбол",
  msgperebiv: "✉️ Перебив сообщений",
};

// ------------------
// Keyboards
// ------------------
const modeKeyboard = {
  inline_keyboard: [
    [
      { text: "🎰 Слот",                callback_data: "mode_slot" },
      { text: "🎲 Кубик",               callback_data: "mode_cube" },
    ],
    [
      { text: "🏀 Баскетбол",           callback_data: "mode_basket" },
      { text: "🎯 Дартс",               callback_data: "mode_darts" },
    ],
    [
      { text: "🎳 Боулинг",             callback_data: "mode_bowling" },
      { text: "⚽️ Футбол",             callback_data: "mode_football" },
    ],
    [
      { text: "✉️ Перебив сообщений",   callback_data: "mode_msgperebiv" },
    ],
  ],
};

const slotSubModeKeyboard = {
  inline_keyboard: [
    [
      { text: "🎯 Триггер джекпота", callback_data: "slot_jackpot" },
      { text: "⏱ Перебив джекпота", callback_data: "slot_perebiv" },
    ],
    [
      { text: "🔙 Сменить режим", callback_data: "back_to_modes" },
    ],
  ],
};

const triggerKeyboard = {
  inline_keyboard: [
    [
      { text: "7️⃣7️⃣7️⃣ 777",      callback_data: "trigger_777" },
      { text: "🅱️ BAR BAR BAR",    callback_data: "trigger_bar" },
    ],
    [
      { text: "🍋 Лимоны",         callback_data: "trigger_lemon" },
      { text: "🍒 Ежевика",        callback_data: "trigger_berry" },
    ],
    [
      { text: "🎰 Все комбинации", callback_data: "trigger_all" },
    ],
    [
      { text: "🔙 Назад",          callback_data: "back_to_slot_sub" },
    ],
  ],
};

// ------------------
// /start
// ------------------
bot.onText(/\/start/, async (msg) => {
  if (msg.chat.type === "private") {
    return bot.sendPhoto(
      msg.chat.id,
      fs.createReadStream("./flop.jpg"),
      {
        caption:
          "👋 Добро пожаловать мой дорогой друг!\n\n" +
          "Добро пожаловать в мой бот лудоман. Бот создан для тригерринга игровых эмодзи и еще мини игры с слот машиной 🎰\n" +
          "В будущем добавим еще новый мини игры пока что так. Бот уже готов приступает к работе 🎯\n" +
          "Для админов чтобы стать админом в лс боту и чтобы он отправлял вам уведомления в лс введите команду /admin 👮‍♂️\n" +
          "Инструкцию по боту введите команду /help ➕\n" +
          "Сделано @us1r_deleted"
      }
    );
  }

  const chatId = msg.chat.id;
  const admins = await getAdmins(chatId);
  if (!isAdmin(admins, msg.from.id)) return;

  botEnabled = true;
  const currentMode = mode.get(chatId);
  const modeText = currentMode ? `Текущий режим: ${modeNames[currentMode]}` : "Режим не выбран";

  bot.sendMessage(chatId, `✅ Бот включён!\n${modeText}\n\nВыбери режим игры:`, { reply_markup: modeKeyboard });
});

// ------------------
// /help
// ------------------
bot.onText(/\/help/, async (msg) => {
  if (msg.chat.type !== "private") return;

  bot.sendMessage(
    msg.chat.id,
    "📖 Инструкция по боту:\n\n" +
    "1️⃣ Добавь бота в группу и напиши /start\n" +
    "2️⃣ Выбери режим игры кнопками\n" +
    "3️⃣ Для слота выбери Триггер или Перебив\n" +
    "4️⃣ Выбери комбинацию для отслеживания\n\n" +
    "5️⃣ Для получения уведомлений в лс — напиши /admin\n\n" +
    "6️⃣ Перебив слота — введи минуты, если за это время никто не выбьет комбинацию, последний выбивший побеждает\n\n" +
    "7️⃣ Перебив сообщений — введи минуты, последний написавший сообщение в группу за это время побеждает\n\n" +
    "Сделано @us1r_deleted"
  );
});

// ------------------
// /mode
// ------------------
bot.onText(/\/mode/, async (msg) => {
  if (msg.chat.type === "private") return;
  const chatId = msg.chat.id;
  const admins = await getAdmins(chatId);
  if (!isAdmin(admins, msg.from.id)) return;

  const currentMode = mode.get(chatId);
  const modeText = currentMode ? `Текущий режим: ${modeNames[currentMode]}` : "Режим не выбран";
  bot.sendMessage(chatId, `🎮 ${modeText}\n\nВыбери новый режим:`, { reply_markup: modeKeyboard });
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
  // сбрасываем перебив сообщений если был активен
  if (lastMsg.has(chatId)) {
    clearTimeout(lastMsg.get(chatId).timeoutId);
    lastMsg.delete(chatId);
  }
  bot.sendMessage(chatId, "🛑 Бот выключен");
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
// text messages
// ------------------
bot.on("message", async (msg) => {
  // приватный — ввод кода
  if (msg.chat.type === "private") {
    if (!msg.text || msg.text.startsWith("/")) return;
    const userId = msg.from.id;
    if (waitingForCode.has(userId)) {
      waitingForCode.delete(userId);
      if (msg.text.trim() === ADMIN_CODE) {
        allowedAdmins.add(userId);
        saveAdmins();
        return bot.sendMessage(msg.chat.id, "✅ Код верный! Ты добавлен в список админов.\nТеперь буду присылать уведомления о выигрышах.");
      } else {
        return bot.sendMessage(msg.chat.id, "❌ Неверный код. Попробуй снова — /admin");
      }
    }
    return;
  }

  if (!msg.text) return;

  const chatId = msg.chat.id;
  const currentMode = mode.get(chatId);

  // группа — ввод минут перебива слота
  if (waitingForMinutes.has(chatId)) {
    if (msg.text.startsWith("/")) return;
    const admins = await getAdmins(chatId);
    if (!isAdmin(admins, msg.from.id)) return;

    const minutes = parseInt(msg.text.trim());
    if (isNaN(minutes) || minutes <= 0) {
      return bot.sendMessage(chatId, "❌ Введи корректное число минут (например: 5)");
    }

    waitingForMinutes.delete(chatId);
    perebivMinutes.set(chatId, minutes);
    slotSubMode.set(chatId, "perebiv");

    return bot.sendMessage(
      chatId,
      `⏱ Время перебива: ${minutes} мин.\n\nВыбери комбинацию для отслеживания:`,
      { reply_markup: triggerKeyboard }
    );
  }

  // группа — ввод минут перебива сообщений
  if (waitingForMsgMinutes.has(chatId)) {
    if (msg.text.startsWith("/")) return;
    const admins = await getAdmins(chatId);
    if (!isAdmin(admins, msg.from.id)) return;

    const minutes = parseInt(msg.text.trim());
    if (isNaN(minutes) || minutes <= 0) {
      return bot.sendMessage(chatId, "❌ Введи корректное число минут (например: 5)");
    }

    waitingForMsgMinutes.delete(chatId);
    msgPerebivMinutes.set(chatId, minutes);

    return bot.sendMessage(
      chatId,
      `✅ Перебив сообщений запущен!\n⏱ Время: ${minutes} мин.\n\nКто последним напишет сообщение и никто не перебьёт за ${minutes} мин. — тот победитель! 🏆`
    );
  }

  // --- логика перебива сообщений ---
  if (botEnabled && currentMode === "msgperebiv" && !msg.text.startsWith("/")) {
    const mins = msgPerebivMinutes.get(chatId);
    if (!mins) return;

    const user = msg.from;
    const prev = lastMsg.get(chatId);

    // сбрасываем старый таймер молча (без уведомления)
    if (prev && prev.timeoutId) {
      clearTimeout(prev.timeoutId);
    }

    const groupLink = getGroupLink(msg.chat);
    const messageLink = getMessageLink(msg.chat, msg.message_id);
    const userLink = user.username ? `https://t.me/${user.username}` : `tg://user?id=${user.id}`;

    // запускаем новый таймер
    const timeoutId = setTimeout(() => {
      const winner = lastMsg.get(chatId);
      if (!winner) return;
      lastMsg.delete(chatId);
       mode.delete(chatId);
  msgPerebivMinutes.delete(chatId);

      const winnerName = winner.username ? `@${winner.username}` : winner.firstName;
      const winnerLink = winner.username ? `https://t.me/${winner.username}` : `tg://user?id=${winner.userId}`;

      // в группу
      bot.sendMessage(chatId, `🏆 ПОБЕДИТЕЛЬ!\n${winnerName} написал последним и никто не перебил за ${mins} мин.! 👑`).catch(() => {});

      // админам
      for (const adminId of allowedAdmins) {
        bot.sendMessage(
          adminId,
          `🏆 ПОБЕДИТЕЛЬ перебива сообщений!\nГруппа: "${msg.chat.title}"\n\n👤 ${winnerName} написал последним — никто не перебил за ${mins} мин.!\n\n🔗 Игрок: ${winnerLink}\n🔗 Группа: ${groupLink}`
        ).catch(() => {});
      }
    }, mins * 60 * 1000);

    lastMsg.set(chatId, {
      userId: user.id,
      firstName: user.first_name,
      username: user.username || null,
      timeoutId,
    });
  }
});

// ------------------
// callback_query
// ------------------
bot.on("callback_query", async (query) => {
  const msg = query.message;
  const chatId = msg.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (msg.chat.type === "private") {
    return bot.answerCallbackQuery(query.id, { text: "❌ Только для групп" });
  }

  if (!botEnabled) {
    return bot.answerCallbackQuery(query.id, { text: "❌ Бот выключен. Напишите /start" });
  }

  try {
    const admins = await getAdmins(chatId);
    if (!isAdmin(admins, userId)) {
      return bot.answerCallbackQuery(query.id, { text: "❌ Только администраторы могут управлять ботом" });
    }
  } catch (e) {
    return bot.answerCallbackQuery(query.id, { text: "❌ Ошибка проверки прав" });
  }

  if (data === "back_to_modes") {
    bot.answerCallbackQuery(query.id);
    return bot.editMessageText("🎮 Выбери режим игры:", {
      chat_id: chatId, message_id: msg.message_id, reply_markup: modeKeyboard
    });
  }

  if (data === "back_to_slot_sub") {
    bot.answerCallbackQuery(query.id);
    return bot.editMessageText("🎰 Режим СЛОТ\n\nВыбери тип отслеживания:", {
      chat_id: chatId, message_id: msg.message_id, reply_markup: slotSubModeKeyboard
    });
  }

  const modeMap = {
    mode_slot: "slot", mode_cube: "cube", mode_basket: "basket",
    mode_darts: "darts", mode_bowling: "bowling", mode_football: "football",
    mode_msgperebiv: "msgperebiv",
  };

  if (modeMap[data]) {
    const selectedMode = modeMap[data];

    // если переключаемся с перебива сообщений — сбрасываем
    if (mode.get(chatId) === "msgperebiv" && selectedMode !== "msgperebiv") {
      if (lastMsg.has(chatId)) {
        clearTimeout(lastMsg.get(chatId).timeoutId);
        lastMsg.delete(chatId);
      }
    }

    mode.set(chatId, selectedMode);
    bot.answerCallbackQuery(query.id, { text: `✅ Режим ${modeNames[selectedMode]} включён!` });

    if (selectedMode === "slot") {
      return bot.editMessageText("🎰 Режим СЛОТ выбран!\n\nВыбери тип отслеживания:", {
        chat_id: chatId, message_id: msg.message_id, reply_markup: slotSubModeKeyboard
      });
    }

    if (selectedMode === "msgperebiv") {
      waitingForMsgMinutes.add(chatId);
      return bot.editMessageText(
        "✉️ Режим: Перебив сообщений\n\n✍️ Напиши в чат количество минут для перебива:",
        { chat_id: chatId, message_id: msg.message_id }
      );
    }

    return bot.editMessageText(
      `✅ Режим игры выбран: ${modeNames[selectedMode]}\n\nХочешь сменить? Нажми кнопку ниже:`,
      { chat_id: chatId, message_id: msg.message_id, reply_markup: modeKeyboard }
    );
  }

  if (data === "slot_jackpot") {
    bot.answerCallbackQuery(query.id);
    slotSubMode.set(chatId, "jackpot");
    return bot.editMessageText("🎯 Триггер джекпота\n\nВыбери комбинацию:", {
      chat_id: chatId, message_id: msg.message_id, reply_markup: triggerKeyboard
    });
  }

  if (data === "slot_perebiv") {
    bot.answerCallbackQuery(query.id);
    waitingForMinutes.add(chatId);
    return bot.editMessageText("⏱ Перебив джекпота\n\n✍️ Напиши в чат количество минут:", {
      chat_id: chatId, message_id: msg.message_id
    });
  }

  const triggerMap = {
    trigger_777: "777", trigger_bar: "bar",
    trigger_lemon: "lemon", trigger_berry: "berry",
    trigger_all: "all",
  };

  if (triggerMap[data]) {
    const selectedTrigger = triggerMap[data];
    slotTrigger.set(chatId, selectedTrigger);
    bot.answerCallbackQuery(query.id, { text: `✅ ${triggerNames[selectedTrigger]}` });

    const sub = slotSubMode.get(chatId);
    let statusText = "";

    if (sub === "jackpot") {
      statusText = `🎰 Режим: Триггер джекпота\n🎯 Комбинация: ${triggerNames[selectedTrigger]}\n\nБот уведомит в группе и админам при каждом выпадении!\n\nДля смены — /mode`;
    } else if (sub === "perebiv") {
      const mins = perebivMinutes.get(chatId) || "?";
      statusText = `🎰 Режим: Перебив джекпота\n🎯 Комбинация: ${triggerNames[selectedTrigger]}\n⏱ Время: ${mins} мин.\n\nДля смены — /mode`;
    }

    return bot.editMessageText(`✅ ${statusText}`, {
      chat_id: chatId, message_id: msg.message_id
    });
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

  const notifyAll = (groupText, adminText) => {
    bot.sendMessage(chatId, groupText).catch(() => {});
    for (const adminId of allowedAdmins) {
      bot.sendMessage(
        adminId,
        `🚨 В группе "${msg.chat.title}"\n${adminText}\n\n🔗 Игрок: ${userLink}\n🔗 Группа: ${groupLink}\n🔗 Сообщение: ${messageLink}`
      ).catch(() => {});
    }
  };

  // ---- SLOT ----
  if (currentMode === "slot" && msg.dice.emoji === "🎰") {
    const trigger = slotTrigger.get(chatId);
    const sub = slotSubMode.get(chatId);

    if (!trigger || !sub) return;

    let isWin = false;
    if (trigger === "all") {
      isWin = allWinValues.has(value);
    } else {
      isWin = value === triggerValues[trigger];
    }

    if (!isWin) return;

    const triggerLabel = trigger === "all" ? getTriggerNameByValue(value) : triggerNames[trigger];

    if (sub === "jackpot") {
      notifyAll(
        `🎰 Игрок ${user.first_name} выбил ${triggerLabel}`,
        `🎰 Игрок ${user.first_name} выбил ${triggerLabel}`
      );
      return;
    }

    if (sub === "perebiv") {
      const mins = perebivMinutes.get(chatId);
      if (!mins) return;

      const prev = lastJackpot.get(chatId);

      if (prev && prev.timeoutId) {
        clearTimeout(prev.timeoutId);
        const prevName = prev.username ? `@${prev.username}` : prev.firstName;
        notifyAll(
          `🔄 ${user.first_name} перебил ${prevName}!\n${triggerLabel}\n⏱ Новый таймер: ${mins} мин.`,  
          `🔄 Перебив! ${user.first_name} перебил ${prevName}\n${triggerLabel}\n⏱ Новый таймер: ${mins} мин.`
        );
      } else {
        notifyAll(
          `🎰 Первый джекпот! Игрок ${user.first_name}\n${triggerLabel}\n⏱ Таймер: ${mins} мин. запущен`,
          `🎰 Первый джекпот! Игрок ${user.first_name}\n${triggerLabel}\n⏱ Таймер: ${mins} мин. запущен`
        );
      }

      const timeoutId = setTimeout(() => {
        const winner = lastJackpot.get(chatId);
        if (!winner) return;
        lastJackpot.delete(chatId);
        mode.delete(chatId); // ← добавь
perebivMinutes.delete(chatId); // ← добавь
slotSubMode.delete(chatId); // ← добавь
slotTrigger.delete(chatId); // ← добавь

        const winnerName = winner.username ? `@${winner.username}` : winner.firstName;
        const winnerLink = winner.username ? `https://t.me/${winner.username}` : `tg://user?id=${winner.userId}`;

        bot.sendMessage(chatId, `🏆 ПОБЕДИТЕЛЬ!\n${winnerName} выбил ${triggerLabel} и никто не перебил за ${mins} мин.! 👑`).catch(() => {});
        for (const adminId of allowedAdmins) {
          bot.sendMessage(
            adminId,
            `🏆 ПОБЕДИТЕЛЬ! В группе "${msg.chat.title}"\n${winnerName} выбил ${triggerLabel} — никто не перебил за ${mins} мин.!\n\n🔗 Игрок: ${winnerLink}\n🔗 Группа: ${groupLink}`
          ).catch(() => {});
        }
      }, mins * 60 * 1000);

      lastJackpot.set(chatId, {
        userId: user.id,
        firstName: user.first_name,
        username: user.username || null,
        timeoutId,
      });

      return;
    }
  }

  // ---- CUBE ----
  if (currentMode === "cube" && msg.dice.emoji === "🎲" && value === 6)
    notifyAll(`🎲 Игрок ${user.first_name} выбил 6`, `🎲 Игрок ${user.first_name} выбил 6`);

  // ---- BASKET ----
  if (currentMode === "basket" && msg.dice.emoji === "🏀" && value === 5)
    notifyAll(`🏀 Игрок ${user.first_name} попал точно в кольцо`, `🏀 Игрок ${user.first_name} попал точно в кольцо`);

  // ---- DARTS ----
  if (currentMode === "darts" && msg.dice.emoji === "🎯" && value === 6)
    notifyAll(`🎯 Игрок ${user.first_name} попал в яблочко`, `🎯 Игрок ${user.first_name} попал в яблочко`);

  // ---- BOWLING ----
  if (currentMode === "bowling" && msg.dice.emoji === "🎳" && value === 6)
    notifyAll(`🎳 Игрок ${user.first_name} сбил все кегли`, `🎳 Игрок ${user.first_name} сбил все кегли`);

  // ---- FOOTBALL ----
  if (currentMode === "football" && (msg.dice.emoji === "⚽" || msg.dice.emoji === "⚽️") && value >= 5)
    notifyAll(`⚽️ Игрок ${user.first_name} забил гол`, `⚽️ Игрок ${user.first_name} забил гол`);
});

console.log("🤖 Бот запущен");

http.createServer((req, res) => res.end("ok")).listen(PORT, () => {
  console.log("Server running on port", PORT);
});