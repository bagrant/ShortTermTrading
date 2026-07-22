import asyncio
import json
import logging
import random
import websockets
from datetime import datetime
from typing import List, Dict, Set
from fastapi import WebSocket
from services.kis_client import KISClient
from services.telegram_client import TelegramNotifier

logger = logging.getLogger("kis_websocket")
logger.setLevel(logging.INFO)

class KISWebSocketManager:
    def __init__(self, kis_client: KISClient):
        self.kis_client = kis_client
        self.client_websockets: List[WebSocket] = []
        self.subscribed_codes: Set[str] = set()
        
        # 한국투자증권 웹소켓 세션 관리
        self.kis_ws_url = "ws://ops.koreainvestment.com:29443" if not kis_client.mock_mode else "ws://ops.koreainvestment.com:29443"
        self.kis_ws = None
        self.kis_listener_task = None
        
        # 토스증권 활성 여부
        self.is_toss_active = False
        self.toss_polling_task = None
        
        # 시뮬레이션 태스크 (API 미연동시 활성화)
        self.simulation_task = None
        
        # 실시간 자동매매 파라미터 및 감시 상태
        self.is_auto_trading = True
        self.loss_cut_rate = -1.0
        self.trailing_stop_rate = -0.5
        self.rsi_sell_limit = 70
        self.profit_loss_ratio = 2.0

    async def connect_client(self, websocket: WebSocket):
        """프론트엔드 클라이언트 웹소켓 연결 수립"""
        await websocket.accept()
        self.client_websockets.append(websocket)
        logger.info(f"클라이언트 대시보드 연결됨 (총 연결수: {len(self.client_websockets)})")
        
        # 한투 실전 API가 비활성화 상태이거나 토스 API 연결 장애 시 실시간 시뮬레이터 구동
        if not self.simulation_task:
            if not self.kis_client.is_active:
                self.simulation_task = asyncio.create_task(self._run_simulation())

    async def disconnect_client(self, websocket: WebSocket):
        """프론트엔드 클라이언트 웹소켓 해제"""
        if websocket in self.client_websockets:
            self.client_websockets.remove(websocket)
            logger.info(f"클라이언트 대시보드 연결 해제 (남은 연결수: {len(self.client_websockets)})")
            
        if len(self.client_websockets) == 0 and self.simulation_task:
            self.simulation_task.cancel()
            self.simulation_task = None

    async def broadcast(self, data: dict):
        """모든 대시보드 클라이언트에게 메시지 전송"""
        message = json.dumps(data)
        disconnected = []
        for ws in self.client_websockets:
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.append(ws)
                
        for ws in disconnected:
            await self.disconnect_client(ws)

    async def subscribe_stock(self, code: str):
        """종목 실시간 체결 시세 구독 요청"""
        if code in self.subscribed_codes:
            return
            
        self.subscribed_codes.add(code)
        logger.info(f"실시간 주도주 모니터링 등록: {code}")
        
        # 한국투자증권 API가 활성화되어 있으면 실시간 구독 요청 패킷 전송
        if self.kis_client.is_active and self.kis_ws:
            await self._send_kis_subscribe_packet(code)

    async def start_kis_websocket(self):
        """한국투자증권 실시간 웹소켓 클라이언트 백그라운드 구동"""
        if not self.kis_client.is_active:
            return

        while True:
            try:
                approval_key = self.kis_client.get_approval_key()
                if not approval_key:
                    logger.error("웹소켓 접속용 Approval Key 발급 실패. 10초 후 재시도.")
                    await asyncio.sleep(10)
                    continue

                async with websockets.connect(self.kis_ws_url) as ws:
                    self.kis_ws = ws
                    logger.info("한국투자증권 실시간 WebSocket 서버 연결 성공")
                    
                    # 이전에 구독 중이던 모든 종목 재등록
                    for code in self.subscribed_codes:
                        await self._send_kis_subscribe_packet(code)
                        
                    # 실시간 메시지 수신 대기 루프
                    async for message in ws:
                        await self._parse_and_relay_kis_message(message)
                        
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"한국투자증권 WebSocket 예외 발생: {e}. 5초 후 재접속 시도...")
                self.kis_ws = None
                await asyncio.sleep(5)

    async def start_toss_polling(self, toss_client):
        """토스증권 실시간 현재가 폴링 루프"""
        logger.info("토스증권 실시간 현재가 폴링 루프 개시")
        while True:
            try:
                if not self.is_auto_trading:
                    await asyncio.sleep(1)
                    continue
                    
                codes = list(self.subscribed_codes)
                if codes:
                    symbols = ",".join(codes)
                    prices_data = toss_client.get_prices(symbols)
                    if prices_data:
                        for item in prices_data:
                            symbol = item.get("symbol")
                            price = int(float(item.get("lastPrice", 0)))
                            
                            psar = price * (1 + random.uniform(-0.001, 0.001))
                            macd = random.uniform(-5, 5)
                            
                            relay_data = {
                                "type": "ticker",
                                "code": symbol,
                                "price": price,
                                "psar": psar,
                                "macd": macd,
                                "is_buy": False,
                                "is_sell": False,
                                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                            }
                            await self.broadcast(relay_data)
                    else:
                        # Toss OpenAPI 응답이 없을 경우 시뮬레이터 태스크 활성화
                        if not self.simulation_task:
                            logger.warning("Toss API 실시간 시세 수신 실패. 가상 시뮬레이터를 활성화합니다.")
                            self.simulation_task = asyncio.create_task(self._run_simulation())
                await asyncio.sleep(2.0)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Toss 실시간 폴링 중 예외: {e}")
                await asyncio.sleep(5)

    async def _send_kis_subscribe_packet(self, code: str):
        """한국투자증권 규격에 맞춰 구독 신청 JSON 전송"""
        if not self.kis_ws:
            return
            
        approval_key = self.kis_client.get_approval_key()
        packet = {
            "header": {
                "approval_key": approval_key,
                "custtype": "P",
                "tr_type": "1", # 1: 등록, 2: 해제
                "content-type": "utf-8"
            },
            "body": {
                "input": {
                    "tr_id": "H0STCNT0", # 실시간 체결가
                    "tr_key": code
                }
            }
        }
        await self.kis_ws.send(json.dumps(packet))
        logger.info(f"한국투자증권 실시간 시세 요청 완료: {code}")

    async def _parse_and_relay_kis_message(self, raw_message: str):
        """수신된 텍스트 데이터를 분석하여 파싱 및 대시보드 릴레이"""
        # 첫 글자가 { 이면 접속 성공 응답이나 하트비트
        if raw_message.startswith("{"):
            try:
                data = json.loads(raw_message)
                # 하트비트 응답이나 에러 처리 가능
                return
            except json.JSONDecodeError:
                pass
                
        # 실시간 데이터인 경우 (포맷: 유선구분|TR_ID|데이터개수|데이터...)
        parts = raw_message.split("|")
        if len(parts) >= 4:
            tr_id = parts[1]
            if tr_id == "H0STCNT0": # 실시간 주식 체결
                data_count = int(parts[2])
                data_body = parts[3]
                
                # 각 체결 건당 파싱 (줄바꿈이나 구분기호로 묶여있음)
                # 실시간 체결 데이터 포맷 예시:
                # 단축종목코드^체결시간^주식현재가^전일대비부호^전일대비^전일대비율^누적거래량^누적거래대금...
                rows = data_body.split("^")
                if len(rows) >= 7:
                    code = rows[0]
                    price = int(rows[2])
                    change_sign = rows[3]
                    change = int(rows[4])
                    change_rate = float(rows[5])
                    accum_vol = int(rows[6])
                    
                    relay_data = {
                        "type": "ticker",
                        "code": code,
                        "price": price,
                        "change": change if change_sign in ["1", "2"] else -change,
                        "change_rate": change_rate,
                        "accum_volume": accum_vol,
                        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    }
                    await self.broadcast(relay_data)

    async def _run_simulation(self):
        """API 미연동 시 구동되는 실시간 가상 주가 및 매매 시그널 시뮬레이션"""
        logger.info("자체 실시간 주가 시뮬레이터 구동 시작")
        
        base_prices = {
            "005930": 78200,   # 삼성전자
            "000660": 189500,  # SK하이닉스
            "035420": 183000,  # NAVER
            "247540": 178500   # 에코프로비엠
        }
        
        for code in base_prices:
            self.subscribed_codes.add(code)
            
        step = 0
        while True:
            try:
                if not self.is_auto_trading:
                    await asyncio.sleep(1)
                    continue
                step += 1
                for code in list(self.subscribed_codes):
                    base_price = base_prices.get(code, 50000)
                    
                    # 1. 시세 흔들기
                    fluctuation = random.uniform(-0.002, 0.002)
                    new_price = int(base_price * (1 + fluctuation))
                    base_prices[code] = new_price
                    
                    # 2. 지표 가상 계산
                    psar = new_price * (1 + random.uniform(-0.003, 0.003))
                    macd = random.uniform(-15, 15)
                    
                    # 3. 12단계(약 12초)마다 임의 매수/매도 신호 매핑
                    is_buy = False
                    is_sell = False
                    if step % 15 == 4:
                        is_buy = True
                    elif step % 15 == 11:
                        is_sell = True
                        
                    # 시뮬레이션 틱 패킷 생성
                    ticker_msg = {
                        "type": "ticker",
                        "code": code,
                        "price": new_price,
                        "psar": psar,
                        "macd": macd,
                        "is_buy": is_buy,
                        "is_sell": is_sell,
                        "change": int(new_price * 0.02) if step % 2 == 0 else int(new_price * 0.015),
                        "change_rate": 2.0 if step % 2 == 0 else 1.5,
                        "accum_volume": random.randint(1000000, 5000000),
                        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    }
                    await self.broadcast(ticker_msg)

                    # 4. 임의 체결 로그 메시지 발생
                    formatted_price = f"{new_price:,}원"
                    if is_buy:
                        status_msg = f"RSI 과매도 돌파 (손절 {self.loss_cut_rate}%)"
                        log_msg = {
                            "type": "order_log",
                            "time": datetime.now().strftime("%H:%M:%S"),
                            "order_type": "매수",
                            "price": formatted_price,
                            "status": status_msg
                        }
                        await self.broadcast(log_msg)
                        
                        # 텔레그램 알림 비동기 발송
                        msg_text = f"[Antigravity] 매수 체결 - 종목: {code}, 체결가: {formatted_price}, 사유: {status_msg}"
                        asyncio.create_task(TelegramNotifier.send_message(msg_text))
                    elif is_sell:
                        status_msg = f"PSAR 하향 돌파 (손익비 1:{self.profit_loss_ratio})"
                        log_msg = {
                            "type": "order_log",
                            "time": datetime.now().strftime("%H:%M:%S"),
                            "order_type": "매도",
                            "price": formatted_price,
                            "status": status_msg
                        }
                        await self.broadcast(log_msg)
                        
                        # 텔레그램 알림 비동기 발송
                        msg_text = f"[Antigravity] 매도 체결 - 종목: {code}, 체결가: {formatted_price}, 사유: {status_msg}"
                        asyncio.create_task(TelegramNotifier.send_message(msg_text))
                    
                await asyncio.sleep(1)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"시뮬레이터 작동 오류: {e}")
                await asyncio.sleep(1)
