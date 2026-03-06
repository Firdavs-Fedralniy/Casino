"""
bank.py — Userbot-банк на Pyrogram
При старте сам загружает все доступные подарки в пул и выбирает рандомно
"""

import asyncio
import logging
import os
import random
from aiohttp import web
from pyrogram import Client
from pyrogram.errors import PeerIdInvalid, FloodWait
from pyrogram.raw import functions
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
log = logging.getLogger("bank")

# --------------------------------------------------
# Конфиг
# --------------------------------------------------
API_ID         = int(os.getenv("API_ID", "0"))
API_HASH       = os.getenv("API_HASH", "")
SESSION_STRING = os.getenv("SESSION_STRING", "")
BANK_PORT      = int(os.getenv("BANK_PORT", "8080"))
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "supersecret")

# Пул загружается автоматически при старте
# Можно добавить вручную резервные gift_id на случай если API не ответит
FALLBACK_GIFT_IDS = [
    5170145012310081615,  # 15⭐ обычный
    5170250947678437525,  # 25⭐ обычный
    5170144170496491616,  # 50⭐ обычный
]

# Пул — заполняется при старте автоматически
gift_pool: list[int] = []

# --------------------------------------------------
# Pyrogram client
# --------------------------------------------------
app = Client(
    "bank_session",
    api_id=API_ID,
    api_hash=API_HASH,
    session_string=SESSION_STRING,
)

# --------------------------------------------------
# Загрузка пула подарков
# --------------------------------------------------
async def load_gift_pool():
    global gift_pool
    try:
        result = await app.invoke(functions.payments.GetStarGifts(hash=0))
        gift_pool = [g.id for g in result.gifts]
        log.info(f"🎁 Пул загружен: {len(gift_pool)} подарков")
        for g in result.gifts:
            limited = "⭐ Лимитир." if getattr(g, "limited", False) else "📦 Обычный"
            log.info(f"  {limited} | {g.id} | {g.stars}⭐")
    except Exception as e:
        log.warning(f"⚠️ Не удалось загрузить пул: {e}")
        log.warning("⚠️ Используем резервные gift_id")
        gift_pool = FALLBACK_GIFT_IDS.copy()

# --------------------------------------------------
# Отправка рандомного подарка
# --------------------------------------------------
async def send_random_gift(user_id: int, winner_name: str):
    if not gift_pool:
        log.error("❌ Пул подарков пуст!")
        return

    gift_id = random.choice(gift_pool)
    log.info(f"🎲 Выбран подарок {gift_id} для {winner_name} ({user_id})")

    try:
        await app.send_gift(
            user_id=user_id,
            gift_id=gift_id,
            text=f"🏆 Поздравляем с победой, {winner_name}! Держи свой приз 🎁"
        )
        log.info(f"✅ Подарок {gift_id} отправлен → {winner_name} ({user_id})")

    except FloodWait as e:
        log.warning(f"⏳ FloodWait {e.value}s — ждём...")
        await asyncio.sleep(e.value)
        await send_random_gift(user_id, winner_name)

    except PeerIdInvalid:
        log.error(f"❌ Пользователь {user_id} не найден — не писал боту в лс")

    except Exception as e:
        log.error(f"❌ Ошибка отправки: {e}")
        # Пробуем резервный подарок
        if gift_id not in FALLBACK_GIFT_IDS and FALLBACK_GIFT_IDS:
            log.info("🔄 Пробуем резервный подарок...")
            fallback_id = random.choice(FALLBACK_GIFT_IDS)
            try:
                await app.send_gift(
                    user_id=user_id,
                    gift_id=fallback_id,
                    text=f"🏆 Поздравляем с победой, {winner_name}! Держи свой приз 🎁"
                )
                log.info(f"✅ Резервный подарок {fallback_id} отправлен → {winner_name}")
            except Exception as e2:
                log.error(f"❌ Резервный тоже не сработал: {e2}")

# --------------------------------------------------
# Webhook handler
# --------------------------------------------------
async def handle_webhook(request: web.Request):
    secret = request.headers.get("X-Secret", "")
    if secret != WEBHOOK_SECRET:
        return web.json_response({"ok": False, "error": "Forbidden"}, status=403)

    try:
        data = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)

    user_id    = data.get("user_id")
    username   = data.get("username")
    first_name = data.get("first_name", "Игрок")

    if not user_id:
        return web.json_response({"ok": False, "error": "user_id required"}, status=400)

    winner_name = f"@{username}" if username else first_name
    log.info(f"🎯 Победитель: {winner_name} (id={user_id})")

    asyncio.create_task(send_random_gift(user_id, winner_name))
    return web.json_response({"ok": True, "message": f"Gift queued for {winner_name}"})


async def handle_health(request: web.Request):
    return web.json_response({"ok": True, "status": "bank is running", "pool_size": len(gift_pool)})


# Обновить пул вручную — GET /reload
async def handle_reload(request: web.Request):
    secret = request.headers.get("X-Secret", "")
    if secret != WEBHOOK_SECRET:
        return web.json_response({"ok": False, "error": "Forbidden"}, status=403)
    await load_gift_pool()
    return web.json_response({"ok": True, "pool_size": len(gift_pool)})


# --------------------------------------------------
# Запуск
# --------------------------------------------------
async def main():
    if not API_ID or not API_HASH:
        log.error("❌ API_ID и API_HASH не заданы!")
        return
    if not SESSION_STRING:
        log.error("❌ SESSION_STRING не задана!")
        return

    await app.start()
    me = await app.get_me()
    log.info(f"✅ Userbot: {me.first_name} (@{me.username})")

    # Загружаем пул при старте
    await load_gift_pool()

    web_app = web.Application()
    web_app.router.add_post("/webhook", handle_webhook)
    web_app.router.add_get("/health",   handle_health)
    web_app.router.add_get("/reload",   handle_reload)

    runner = web.AppRunner(web_app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", BANK_PORT)
    await site.start()
    log.info(f"🌐 Сервер запущен на порту {BANK_PORT}")

    try:
        await asyncio.Event().wait()
    finally:
        await app.stop()
        await runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())