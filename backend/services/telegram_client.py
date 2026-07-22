import urllib.request
import json
import asyncio
import logging
from config import Config

logger = logging.getLogger("telegram_client")

def _send_telegram_sync(token: str, chat_id: str, message: str):
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            status = response.getcode()
            if status == 200:
                logger.info("텔레그램 알림 메시지 전송 완료.")
            else:
                logger.error(f"텔레그램 전송 실패 (상태 코드: {status}).")
    except Exception as e:
        logger.error(f"텔레그램 전송 예외 발생: {e}")

class TelegramNotifier:
    @staticmethod
    async def send_message(message: str):
        token = Config.TELEGRAM_BOT_TOKEN
        chat_id = Config.TELEGRAM_CHAT_ID
        if not token or not chat_id or "your_" in token or "your_" in chat_id:
            logger.info("텔레그램 토큰 또는 Chat ID가 비어있거나 디폴트 값입니다. 메시지 전송 생략.")
            return
        
        # 파이썬 내장 스레드풀을 이용해 비동기 안전하게 전송 (외부 DLL 로딩 차단 우회)
        try:
            await asyncio.to_thread(_send_telegram_sync, token, chat_id, message)
        except Exception as e:
            logger.error(f"텔레그램 비동기 전송 스레드 풀 오류: {e}")
