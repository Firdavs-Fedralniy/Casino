import asyncio
import sys

# Фикс для Python 3.10+
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)

from pyrogram import Client

API_ID   = 20504403       # ← вставь свой api_id с my.telegram.org
API_HASH = "ac5bdb399c0e04e91c7b4dc2ee7786fc"     # ← вставь свой api_hash

async def main():
    async with Client("temp", api_id=API_ID, api_hash=API_HASH) as app:
        session = await app.export_session_string()
        print("\n" + "="*60)
        print("✅ ТВОЯ SESSION STRING (скопируй целиком):")
        print("="*60)
        print(session)
        print("="*60)
        print("\nВставь эту строку в Render как переменную SESSION_STRING")

loop.run_until_complete(main())
