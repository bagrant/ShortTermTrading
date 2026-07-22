import asyncio
import logging
import json
import requests
from typing import List, Dict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from services.kis_client import KISClient
from services.toss_client import TossClient
from services.kis_websocket import KISWebSocketManager
from services.liquidity import LiquidityEngine
from services.database import DatabaseManager
from services.trading_executor import TradingExecutor

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

app = FastAPI(title="Antigravity Short Term Trading System API")

# CORS 미들웨어 설정 (프론트엔드 연동)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 글로벌 매매 설정 정보 보관 (기본값 세팅)
trading_settings = {
    "is_auto_trading": True,
    "loss_cut_rate": -1.0,
    "trailing_stop_rate": -0.5,
    "rsi_sell_limit": 70,
    "profit_loss_ratio": 2.0,
    "exclude_sector_ratio": 10.0,
    
    # OpenAPI 정보
    "api_provider": "kis",
    "api_url": "https://openapim.koreainvestment.com:8500",
    "api_key": "your_app_key_here",
    "api_secret": "your_app_secret_here",
    "account_no": "your_account_number_8_digits",
    "account_prdt": "01",
    "mock_mode": True,
    
    # Toss OpenAPI 정보
    "toss_client_id": "",
    "toss_client_secret": "",
    "toss_account_seq": "",
    "toss_account_no": "",
    "virtual_capital": 800000.0,
    
    # 등록 알고리즘 목록
    "algorithms": [
        {
            "id": "macd_rsi",
            "name": "MACD+RSI 하이브리드",
            "description": "RSI 과매도 구간(<=30)에서 탈출할 때 MACD 골든크로스를 동시 확인하여 진입",
            "loss_cut_rate": -1.0,
            "trailing_stop_rate": -0.5,
            "rsi_buy_limit": 30,
            "rsi_sell_limit": 70,
            "is_active": True
        },
        {
            "id": "psar_breakout",
            "name": "PSAR 추세 돌파",
            "description": "파라볼릭 SAR 점이 캔들 아래로 찍히는 추세 전환점에서 대량 거래량을 동반한 돌파 시 진입",
            "loss_cut_rate": -1.5,
            "trailing_stop_rate": -0.8,
            "rsi_buy_limit": 30,
            "rsi_sell_limit": 70,
            "is_active": True
        }
    ]
}

# 싱글톤 서비스 초기화
kis_client = KISClient()
toss_client = TossClient()
ws_manager = KISWebSocketManager(kis_client)
ws_manager.is_auto_trading = trading_settings["is_auto_trading"]
ws_manager.loss_cut_rate = trading_settings["loss_cut_rate"]
ws_manager.trailing_stop_rate = trading_settings["trailing_stop_rate"]
ws_manager.rsi_sell_limit = trading_settings["rsi_sell_limit"]
ws_manager.profit_loss_ratio = trading_settings["profit_loss_ratio"]

liquidity_engine = LiquidityEngine(kis_client)
trading_executor = TradingExecutor(kis_client, toss_client, ws_manager, liquidity_engine)

# 주문 요청 DTO 정의
class OrderRequest(BaseModel):
    code: str
    order_type: str  # 'BUY' 또는 'SELL'
    qty: int
    price: int = 0  # 0일 경우 시장가 주문

class AlgorithmItem(BaseModel):
    id: str
    name: str
    description: str
    loss_cut_rate: float
    trailing_stop_rate: float
    rsi_buy_limit: int = 30
    rsi_sell_limit: int = 70
    is_active: bool

class SettingsRequest(BaseModel):
    is_auto_trading: bool
    loss_cut_rate: float
    trailing_stop_rate: float
    rsi_sell_limit: int
    profit_loss_ratio: float
    exclude_sector_ratio: float
    api_provider: str = "kis"
    api_url: str = "https://openapim.koreainvestment.com:8500"
    api_key: str = ""
    api_secret: str = ""
    account_no: str = ""
    account_prdt: str = "01"
    mock_mode: bool = True
    toss_client_id: str = ""
    toss_client_secret: str = ""
    toss_account_seq: str = ""
    toss_account_no: str = ""
    virtual_capital: float = 800000.0
    algorithms: List[AlgorithmItem] = []

@app.get("/api/settings")
def get_settings():
    global trading_settings
    db_settings = DatabaseManager.load_settings()
    if db_settings:
        trading_settings.update(db_settings)
    return trading_settings

@app.post("/api/settings")
def update_settings(settings: SettingsRequest):
    global trading_settings
    s_dict = settings.dict()
    DatabaseManager.save_settings(s_dict)
    trading_settings.update(s_dict)
    
    # 웹소켓 매니저의 변수 동기화
    ws_manager.is_auto_trading = trading_settings["is_auto_trading"]
    ws_manager.loss_cut_rate = trading_settings["loss_cut_rate"]
    ws_manager.trailing_stop_rate = trading_settings["trailing_stop_rate"]
    ws_manager.rsi_sell_limit = trading_settings["rsi_sell_limit"]
    ws_manager.profit_loss_ratio = trading_settings["profit_loss_ratio"]
    
    # kis_client 및 toss_client 자격증명 동적 업데이트
    if trading_settings.get("api_provider") == "kis":
        kis_client.update_credentials(
            app_key=trading_settings.get("api_key", ""),
            app_secret=trading_settings.get("api_secret", ""),
            cano=trading_settings.get("account_no", ""),
            acnt_prdt_cd=trading_settings.get("account_prdt", "01"),
            mock_mode=trading_settings.get("mock_mode", True),
            base_url=trading_settings.get("api_url", "")
        )
        toss_client.is_active = False
        ws_manager.is_toss_active = False
    elif trading_settings.get("api_provider") == "toss":
        kis_client.is_active = False
        toss_client.update_credentials(
            client_id=trading_settings.get("toss_client_id", ""),
            client_secret=trading_settings.get("toss_client_secret", ""),
            account_seq=trading_settings.get("toss_account_seq", ""),
            account_no=trading_settings.get("toss_account_no", ""),
            mock_mode=trading_settings.get("mock_mode", True)
        )
        ws_manager.is_toss_active = toss_client.is_active
    
    return {"status": "success", "settings": trading_settings}

class TossAccountFetchRequest(BaseModel):
    client_id: str
    client_secret: str

@app.post("/api/toss/fetch-accounts")
def fetch_toss_accounts(req: TossAccountFetchRequest):
    token_url = "https://openapi.tossinvest.com/oauth2/token"
    token_payload = {
        "grant_type": "client_credentials",
        "client_id": req.client_id,
        "client_secret": req.client_secret
    }
    try:
        res = requests.post(token_url, data=token_payload, timeout=5)
        if res.status_code != 200:
            raise HTTPException(status_code=400, detail=f"토스증권 토큰 발급 실패 (상태 코드: {res.status_code}): {res.text}")
        token_data = res.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="토스증권 토큰 정보가 올바르지 않습니다.")
            
        accounts_url = "https://openapi.tossinvest.com/api/v1/accounts"
        headers = {
            "Authorization": f"Bearer {access_token}"
        }
        acc_res = requests.get(accounts_url, headers=headers, timeout=5)
        if acc_res.status_code != 200:
            raise HTTPException(status_code=400, detail=f"토스증권 계좌 조회 실패 (상태 코드: {acc_res.status_code})")
        
        acc_data = acc_res.json()
        accounts = acc_data.get("result", [])
        if not isinstance(accounts, list):
            if isinstance(acc_data, list):
                accounts = acc_data
            else:
                accounts = []
        return {"status": "success", "accounts": accounts}
    except Exception as e:
        logger.error(f"토스증권 계좌 연동 오류: {e}")
        raise HTTPException(status_code=500, detail=f"연동 오류: {str(e)}")

@app.on_event("startup")
async def startup_event():
    """서버 기동 시 DB 초기화, 설정을 로드하고 WebSocket 수신 루프를 백그라운드로 띄움"""
    # 1. DuckDB 테이블 초기화
    DatabaseManager.init_db()
    
    # 2. config_toss.properties 파일 자동 매핑 검사
    from pathlib import Path
    toss_prop_file = Path(__file__).resolve().parent.parent / "config_toss.properties"
    parsed_client_id = ""
    parsed_client_secret = ""
    if toss_prop_file.exists():
        logger.info("config_toss.properties 파일 감지. 토스증권 API 자동 매핑을 시도합니다.")
        try:
            with open(toss_prop_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if ":" in line:
                        parts = line.split(":", 1)
                        key = parts[0].strip()
                        val = parts[1].strip()
                        if "클라이언트 ID" in key:
                            parsed_client_id = val
                        elif "클라이언트 Secret" in key:
                            parsed_client_secret = val
            if parsed_client_id and parsed_client_secret:
                logger.info(f"자격증명 추출 성공 (Client ID: {parsed_client_id[:10]}...)")
        except Exception as e:
            logger.error(f"config_toss.properties 파싱 중 오류 발생: {e}")

    # 3. DB에 적재된 설정 정보 불러와 로컬 메모리 동기화 및 kis_client 키 주입
    global trading_settings
    db_settings = DatabaseManager.load_settings()
    if db_settings:
        trading_settings.update(db_settings)
        
    # config_toss.properties에서 파싱된 값이 있다면 DB/메모리 설정을 강제 동기화
    if parsed_client_id and parsed_client_secret:
        if (trading_settings.get("toss_client_id") != parsed_client_id or 
            trading_settings.get("toss_client_secret") != parsed_client_secret or
            trading_settings.get("api_provider") != "toss"):
            
            trading_settings["toss_client_id"] = parsed_client_id
            trading_settings["toss_client_secret"] = parsed_client_secret
            trading_settings["api_provider"] = "toss"
            
            DatabaseManager.save_settings(trading_settings)
            logger.info("config_toss.properties의 자격증명을 DB 및 메모리 설정에 동기화하였습니다.")

    ws_manager.is_auto_trading = trading_settings.get("is_auto_trading", True)
    ws_manager.loss_cut_rate = trading_settings.get("loss_cut_rate", -1.0)
    ws_manager.trailing_stop_rate = trading_settings.get("trailing_stop_rate", -0.5)
    ws_manager.rsi_sell_limit = trading_settings.get("rsi_sell_limit", 70)
    ws_manager.profit_loss_ratio = trading_settings.get("profit_loss_ratio", 2.0)
    
    provider = trading_settings.get("api_provider", "kis")
    if provider == "kis":
        kis_client.update_credentials(
            app_key=trading_settings.get("api_key", ""),
            app_secret=trading_settings.get("api_secret", ""),
            cano=trading_settings.get("account_no", ""),
            acnt_prdt_cd=trading_settings.get("account_prdt", "01"),
            mock_mode=trading_settings.get("mock_mode", True),
            base_url=trading_settings.get("api_url", "")
        )
        toss_client.is_active = False
        ws_manager.is_toss_active = False
    elif provider == "toss":
        kis_client.is_active = False
        toss_client.update_credentials(
            client_id=trading_settings.get("toss_client_id", ""),
            client_secret=trading_settings.get("toss_client_secret", ""),
            account_seq=trading_settings.get("toss_account_seq", ""),
            account_no=trading_settings.get("toss_account_no", ""),
            mock_mode=trading_settings.get("mock_mode", True)
        )
        ws_manager.is_toss_active = toss_client.is_active

    if kis_client.is_active:
        logger.info("한국투자증권 API 활성화 감지. WebSocket 스트림 리스너 작동 개시.")
        asyncio.create_task(ws_manager.start_kis_websocket())
    elif toss_client.is_active:
        logger.info("토스증권 API 활성화 감지. 실시간 현재가 폴링 작동 개시.")
        asyncio.create_task(ws_manager.start_toss_polling(toss_client))
    else:
        provider_name = "토스증권" if provider == "toss" else "한국투자증권"
        logger.info(f"{provider_name} API 미비 또는 모의 모드. 실시간 가상 주가 시뮬레이터로 대체 작동.")
        
    # 자동매매 거래 실행기(TradingExecutor) 가동
    trading_executor.start()

@app.get("/api/balance")
def get_balance():
    """종합 자산 현황 및 포트폴리오 잔고 조회"""
    try:
        provider = trading_settings.get("api_provider", "kis")
        if provider == "toss":
            balance_data = toss_client.get_balance()
        else:
            balance_data = kis_client.get_balance()
            
        if balance_data is None:
            logger.warning("잔고 정보를 조회하지 못해 가상 시뮬레이션 데이터로 자동 폴백합니다.")
            balance_data = kis_client._get_fallback_balance()
            
        # KIS / Toss 가상 시뮬레이터(또는 모의 모드)인 경우 가상 자본금(virtual_capital)을 설정된 자본금 금액에 맞춰 스케일링
        is_mock = trading_settings.get("mock_mode", True)
        if is_mock or not kis_client.is_active or not toss_client.is_active:
            target_cap = float(trading_settings.get("virtual_capital", 10000000.0))
            if target_cap <= 0:
                target_cap = 10000000.0
                
            base_eval = float(balance_data.get("eval_amount", 41971000.0))
            if base_eval <= 0:
                base_eval = 41971000.0
                
            ratio = target_cap / base_eval
            
            scaled_data = dict(balance_data)
            
            holdings = []
            total_scaled_buy = 0
            total_scaled_eval = 0
            total_scaled_profit = 0
            
            for h in balance_data.get("holdings", []):
                h_copy = dict(h)
                orig_qty = float(h_copy.get("qty", 1))
                buy_price = int(h_copy.get("buy_price", 0))
                curr_price = int(h_copy.get("curr_price", 0))
                
                # 수량을 자본금 비율에 맞춰 현실적으로 조율 (원래 0이었으면 0, 아니면 최소 1주)
                new_qty = max(1, int(round(orig_qty * ratio))) if orig_qty > 0 else 0
                h_copy["qty"] = new_qty
                h_copy["buy_price"] = buy_price
                h_copy["curr_price"] = curr_price
                
                eval_profit = int((curr_price - buy_price) * new_qty)
                h_copy["eval_profit"] = eval_profit
                if buy_price > 0:
                    h_copy["profit_rate"] = round(((curr_price - buy_price) / buy_price) * 100, 2)
                    
                item_buy_amt = buy_price * new_qty
                item_eval_amt = curr_price * new_qty
                
                total_scaled_buy += item_buy_amt
                total_scaled_eval += item_eval_amt
                total_scaled_profit += eval_profit
                
                holdings.append(h_copy)
                
            scaled_data["holdings"] = holdings
            
            if holdings:
                scaled_data["buy_amount"] = total_scaled_buy
                scaled_data["eval_amount"] = total_scaled_eval
                scaled_data["evaluation_profit"] = total_scaled_profit
                scaled_data["total_profit_rate"] = round(((total_scaled_profit / total_scaled_buy) * 100), 2) if total_scaled_buy > 0 else 0.0
            else:
                scaled_data["eval_amount"] = int(target_cap)
                scaled_data["buy_amount"] = int(scaled_data.get("buy_amount", 0) * ratio)
                scaled_data["evaluation_profit"] = int(scaled_data.get("evaluation_profit", 0) * ratio)
                
            scaled_data["realized_profit"] = int(scaled_data.get("realized_profit", 0) * ratio)
            return scaled_data
            
        return balance_data
    except Exception as e:
        logger.error(f"balance API 오류: {e}")
        # 예외 발생 시에도 500 에러 대신 폴백 데이터 반환
        return kis_client._get_fallback_balance()

@app.get("/api/liquidity")
def get_liquidity():
    """당일 유동성 및 섹터 분석 추천 목록 조회"""
    try:
        exclude_ratio = trading_settings.get("exclude_sector_ratio", 10.0)
        algs = trading_settings.get("algorithms", [])
        
        provider = trading_settings.get("api_provider", "kis")
        liquidity_engine.kis_client = toss_client if provider == "toss" else kis_client
        
        analysis_data = liquidity_engine.analyze_market_liquidity(exclude_ratio=exclude_ratio, algorithms=algs)
        return analysis_data
    except Exception as e:
        logger.error(f"liquidity API 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/order")
def place_order(order: OrderRequest):
    """실시간 주문 실행"""
    try:
        provider = trading_settings.get("api_provider", "kis")
        if provider == "toss":
            res = toss_client.send_order(
                code=order.code,
                order_type=order.order_type,
                qty=order.qty,
                price=order.price
            )
        else:
            res = kis_client.send_order(
                code=order.code,
                order_type=order.order_type,
                qty=order.qty,
                price=order.price
            )
        if res is None:
            raise HTTPException(status_code=500, detail="주문 실행 실패")
        return res
    except Exception as e:
        logger.error(f"order API 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/reporting")
def get_reporting_stats():
    """등록된 알고리즘별 모의투자 수익률 및 주간/월간/년간 성과 리포트 조회"""
    try:
        stats = DatabaseManager.get_reporting_data()
        return stats
    except Exception as e:
        logger.error(f"reporting API 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """대시보드 실시간 연동을 위한 WebSocket 엔드포인트"""
    await ws_manager.connect_client(websocket)
    try:
        while True:
            # 클라이언트로부터 수신하는 패킷 처리 (예: 종목 실시간 구독 변경 요청)
            data_str = await websocket.receive_text()
            try:
                data = json.loads(data_str)
                action = data.get("action")
                if action == "subscribe":
                    code = data.get("code")
                    if code:
                        await ws_manager.subscribe_stock(code)
            except Exception as e:
                logger.error(f"WebSocket 수신 데이터 파싱 에러: {e}")
    except WebSocketDisconnect:
        await ws_manager.disconnect_client(websocket)
    except Exception as e:
        logger.error(f"WebSocket 커넥션 예외 발생: {e}")
        await ws_manager.disconnect_client(websocket)

# 프론트엔드 빌드 정적 파일 서빙 (Render / Production 배포 환경용)
import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.exists(frontend_dist):
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
        
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if full_path.startswith("api") or full_path.startswith("ws"):
            raise HTTPException(status_code=404, detail="Not Found")
        file_path = os.path.join(frontend_dist, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dist, "index.html"))

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("main:app", host="0.0.0.0", port=port)

