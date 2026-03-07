"""
bank.py — Userbot-банк на Pyrogram
Загружает подарки которые реально есть на аккаунте-банке
"""

import asyncio
import logging
import os
import random
from aiohttp import web
from pyrogram import Client
from pyrogram.errors import PeerIdInvalid, FloodWait
from pyrogram.raw import functions, types
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

# Пул — заполняется при старте из профиля аккаунта
# Каждый элемент: {"gift_id": int, "msg_id": int}
gift_pool: list[dict] = []

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
# Загрузка подарков с аккаунта банка
# --------------------------------------------------
async def load_gift_pool():
    global gift_pool
    try:
        # Получаем подарки из профиля аккаунта-банка
        result = await app.invoke(
            functions.payments.GetSavedStarGifts(
                peer=await app.resolve_peer("me"),
                offset="",
                limit=100,
            )
        )
        gift_pool = []
        for gift in result.gifts:
            # Только не проданные и не переведённые
            if not getattr(gift, "unsaved", False):
                stars = getattr(gift.gift, "stars", None) or getattr(gift.gift, "star_count", 0)
                gift_pool.append({
                    "gift_id": gift.gift.id,
                    "msg_id":  gift.msg_id,
                    "stars":   stars,
                })

        log.info(f"🎁 Подарков на аккаунте: {len(gift_pool)}")
        for g in gift_pool:
            log.info(f"  gift_id={g['gift_id']} | {g['stars']}⭐ | msg_id={g['msg_id']}")

    except Exception as e:
        log.warning(f"⚠️ Не удалось загрузить подарки с аккаунта: {e}")
        log.warning("⚠️ Пул пуст — пополни подарки на аккаунте банка")
        gift_pool = []

# --------------------------------------------------
# Отправка рандомного подарка
# --------------------------------------------------
async def send_random_gift(user_id: int, winner_name: str):
    if not gift_pool:
        log.error("❌ Пул подарков пуст! Пополни аккаунт-банк подарками.")
        return

        total_stars = sum(g.get("stars", 0) for g in gift_pool)
    if total_stars < 25:
        log.warning(f"⚠️ Мало звёзд в банке: {total_stars}⭐ (минимум 25). Пополни подарки!")
        # Уведомляем победителя что банк пуст
        try:
            await app.send_message(
                user_id,
                f"⚠️ К сожалению, в банке закончились звёзды.\nПожалуйста, свяжитесь с администратором."
            )
        except Exception:
            pass
        return


    # Берём рандомный подарок из пула
    chosen = random.choice(gift_pool)
    gift_id = chosen["gift_id"]
    log.info(f"🎲 Выбран подарок {gift_id} ({chosen['stars']}⭐) для {winner_name} ({user_id})")

    try:
        await app.send_gift(
            chat_id=user_id,
            gift_id=gift_id,
        )
        # Убираем из пула после отправки
        gift_pool.remove(chosen)
        log.info(f"✅ Подарок {gift_id} отправлен → {winner_name} | Осталось в пуле: {len(gift_pool)}")

    except FloodWait as e:
        log.warning(f"⏳ FloodWait {e.value}s — ждём...")
        await asyncio.sleep(e.value)
        await send_random_gift(user_id, winner_name)

    except PeerIdInvalid:
        log.error(f"❌ Пользователь {user_id} не найден — не писал боту в лс")

    except Exception as e:
        log.error(f"❌ Ошибка отправки: {e}")

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
    gifts_info = [{"gift_id": g["gift_id"], "stars": g["stars"]} for g in gift_pool]
    return web.json_response({
        "ok": True,
        "status": "bank is running",
        "pool_size": len(gift_pool),
        "gifts": gifts_info,
    })


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
