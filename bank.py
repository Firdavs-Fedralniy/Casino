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
        result = await app.invoke(
            functions.payments.GetSavedStarGifts(
                peer=await app.resolve_peer("me"),
                offset="",
                limit=100,
            )
        )
        gift_pool = []
        for gift in result.gifts:
            if not getattr(gift, "unsaved", False):
                stars = getattr(gift.gift, "stars", None) or getattr(gift.gift, "star_count", 0)
                # NFT = у подарка есть availability_total (лимитированный выпуск)
                is_nft = getattr(gift.gift, "availability_total", None) is not None
                title  = getattr(gift.gift, "title", None)
                gift_pool.append({
                    "gift_id": gift.gift.id,
                    "msg_id":  gift.msg_id,
                    "stars":   stars,
                    "is_nft":  is_nft,
                    "title":   title or ("NFT" if is_nft else "Подарок"),
                })

        log.info(f"🎁 Подарков на аккаунте: {len(gift_pool)}")
        for g in gift_pool:
            kind = "🖼 NFT" if g["is_nft"] else "🎁 обычный"
            log.info(f"  {kind} | gift_id={g['gift_id']} | {g['stars']}⭐ | msg_id={g['msg_id']} | {g['title']}")

    except Exception as e:
        log.warning(f"⚠️ Не удалось загрузить подарки с аккаунта: {e}")
        gift_pool = []

# --------------------------------------------------
# Передача NFT
# --------------------------------------------------
async def transfer_nft(user_id: int, msg_id: int, winner_name: str):
    try:
        peer = await app.resolve_peer(user_id)
        await app.invoke(
            functions.payments.TransferStarGift(
                stargift=types.InputSavedStarGiftUser(msg_id=msg_id),
                to_id=peer,
            )
        )
        log.info(f"✅ NFT (msg_id={msg_id}) передан пользователю {user_id}")
        return True

    except FloodWait as e:
        log.warning(f"⏳ FloodWait {e.value}s...")
        await asyncio.sleep(e.value)
        return await transfer_nft(user_id, msg_id, winner_name)

    except PeerIdInvalid:
        log.error(f"❌ Пользователь {user_id} не найден")
        return False

    except Exception as e:
        err = str(e)
        if "STARGIFT_TRANSFER_TOO_EARLY" in err:
            # Извлекаем секунды из ошибки
            import re
            match = re.search(r'TOO_EARLY_(\d+)', err)
            seconds = int(match.group(1)) if match else "?"
            hours = round(int(seconds) / 3600, 1) if match else "?"
            log.warning(f"⏳ NFT msg_id={msg_id} ещё заблокирован на {seconds}с ({hours}ч) — пробуем другой")
            return "too_early"
        log.error(f"❌ Ошибка передачи NFT: {e}")
        return False

# --------------------------------------------------
# Отправка рандомного подарка
# --------------------------------------------------
async def send_random_gift(user_id: int, winner_name: str):
    if not gift_pool:
        log.error("❌ Пул подарков пуст!")
        try:
            await app.send_message(user_id, "⚠️ В банке закончились подарки. Свяжитесь с администратором.")
        except Exception:
            pass
        return

    total_stars = sum(g.get("stars", 0) for g in gift_pool)
    if total_stars < 25:
        log.warning(f"⚠️ Мало звёзд в банке: {total_stars}⭐")
        try:
            await app.send_message(
                user_id,
                f"⚠️ В банке осталось мало звёзд ({total_stars}⭐).\nПожалуйста, свяжитесь с администратором."
            )
        except Exception:
            pass
        return

    # ТЕСТ — всегда первый NFT
    nft_gifts = [g for g in gift_pool if g["is_nft"]]
    if not nft_gifts:
        log.error("❌ NFT в пуле нет!")
        try:
            await app.send_message(user_id, "❌ NFT закончились. Свяжитесь с администратором.")
        except Exception:
            pass
        return

    chosen  = nft_gifts[0]
    gift_id = chosen["gift_id"]
    msg_id  = chosen["msg_id"]
    is_nft  = chosen["is_nft"]
    title   = chosen["title"]
    stars   = chosen["stars"]

    log.info(f"🎲 Выбран {'NFT' if is_nft else 'подарок'} «{title}» ({stars}⭐) для {winner_name} ({user_id})")

    try:
        if is_nft:
            await app.send_message(
                user_id,
                f"🏆 Поздравляем, {winner_name}!\n\n"
                f"Ты выбил джекпот и получаешь уникальный NFT! 🖼\n"
                f"Передаю прямо сейчас... 👇"
            )

            nft_gifts = [g for g in gift_pool if g["is_nft"]]
            sent = False
            for candidate in nft_gifts:
                result = await transfer_nft(user_id, candidate["msg_id"], winner_name)
                    if result is True:
                    await app.send_message(user_id, f"🎁 NFT «{candidate['title']}» успешно передан!")
                    gift_pool.remove(candidate)
                    log.info(f"✅ NFT «{candidate['title']}» передан → {winner_name} | Осталось: {len(gift_pool)}")
                    sent = True
                    break
                elif result == "too_early":
                    log.warning(f"⏳ NFT «{candidate['title']}» заблокирован — пробуем следующий")
                    continue
                else:
                    break

          if not sent:
                log.warning("⚠️ Все NFT заблокированы — ничего не отправляем")
                try:
                    await app.send_message(user_id, "⚠️ NFT временно недоступен. Свяжитесь с администратором.")
                except Exception:
                    pass

        else:
            await app.send_message(
                user_id,
                f"🏆 Поздравляем, {winner_name}!\n\n"
                f"Ты выбил джекпот и получаешь подарок 🎁\n"
                f"Стоимость: {stars}⭐\n\n"
                f"Держи свой приз! 👇"
            )
            await app.send_gift(chat_id=user_id, gift_id=gift_id)
            gift_pool.remove(chosen)
            log.info(f"✅ Подарок {gift_id} отправлен → {winner_name} | Осталось: {len(gift_pool)}")

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
    gifts_info = []
    for g in gift_pool:
        gifts_info.append({
            "gift_id": g["gift_id"],
            "stars":   g["stars"],
            "is_nft":  g["is_nft"],
            "title":   g["title"],
        })
    total_stars = sum(g.get("stars", 0) for g in gift_pool)
    return web.json_response({
        "ok":          True,
        "status":      "bank is running",
        "pool_size":   len(gift_pool),
        "total_stars": total_stars,
        "gifts":       gifts_info,
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
    import inspect
    log.info(f"DEBUG TransferStarGift: {inspect.signature(functions.payments.TransferStarGift.__init__)}")

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