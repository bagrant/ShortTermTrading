import os
from pathlib import Path
from dotenv import load_dotenv

# .env 파일 로드 (.env 파일이 부모 폴더에 위치하므로 상위 디렉토리를 찾아 읽음)
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

class Config:
    # API 자격증명
    APP_KEY = os.getenv("KIS_APPKEY", "")
    APP_SECRET = os.getenv("KIS_APPSECRET", "")
    ACCOUNT_NO = os.getenv("KIS_ACCOUNT_NO", "")
    ACCOUNT_PRDT = os.getenv("KIS_ACCOUNT_PRDT", "01")
    
    # 모의/실전 분기
    MOCK_MODE = os.getenv("KIS_MOCK_MODE", "True").lower() == "true"
    
    # 한국투자증권 접속 호스트 설정
    if MOCK_MODE:
        # 모의투자
        REST_BASE_URL = "https://openapim.koreainvestment.com:8500"
        WS_BASE_URL = "ws://ops.koreainvestment.com:29443"
    else:
        # 실전투자
        REST_BASE_URL = "https://openapi.koreainvestment.com:8500"
        WS_BASE_URL = "ws://ops.koreainvestment.com:29443"

    # 기타 텔레그램 연동 정보
    TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
