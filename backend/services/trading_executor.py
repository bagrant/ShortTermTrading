import asyncio
import logging
import random
from datetime import datetime
from services.database import DatabaseManager
from services.telegram_client import TelegramNotifier

logger = logging.getLogger("trading_executor")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(name)s: %(message)s'))
logger.addHandler(handler)

def calculate_rsi(prices, period=14):
    if len(prices) < period + 1:
        return 50.0
    deltas = [prices[i+1] - prices[i] for i in range(len(prices)-1)]
    gains = [d if d > 0 else 0 for d in deltas]
    losses = [-d if d < 0 else 0 for d in deltas]
    
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    
    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))

def calculate_macd(prices):
    if len(prices) < 26:
        return 0.0, 0.0, 0.0
    
    ema12 = prices[0]
    ema26 = prices[0]
    k12 = 2 / (12 + 1)
    k26 = 2 / (26 + 1)
    macd_line_history = []
    for p in prices:
        ema12 = p * k12 + ema12 * (1 - k12)
        ema26 = p * k26 + ema26 * (1 - k26)
        macd_line_history.append(ema12 - ema26)
    
    signal = macd_line_history[0]
    k9 = 2 / (9 + 1)
    for m in macd_line_history:
        signal = m * k9 + signal * (1 - k9)
        
    macd_hist = macd_line_history[-1] - signal
    return macd_line_history[-1], signal, macd_hist

class TradingExecutor:
    def __init__(self, kis_client, toss_client, ws_manager, liquidity_engine):
        self.kis_client = kis_client
        self.toss_client = toss_client
        self.ws_manager = ws_manager
        self.liquidity_engine = liquidity_engine
        
        self.active_positions = {} # symbol -> {buy_price, qty, peak_price, buy_time, algo_id, name}
        self.running_task = None
        self._pre_market_notified_date = None

    def start(self):
        if not self.running_task:
            self.running_task = asyncio.create_task(self._run_loop())
            logger.info("일단위 스케줄러 탑재 자동매매 거래 실행기 구동 시작")

    async def _run_loop(self):
        settlement_done_date = None
        
        while True:
            try:
                # 1. DB 설정 로드
                settings = DatabaseManager.load_settings()
                is_auto_trading = settings.get("is_auto_trading", False)
                if not is_auto_trading:
                    await asyncio.sleep(10)
                    continue

                now = datetime.now()
                weekday = now.weekday() # 0=월요일, 4=금요일, 5=토요일, 6=일요일
                current_time_str = now.strftime("%H:%M")
                current_date_str = now.strftime("%Y-%m-%d")
                
                # 주말 대기 모드 (토/일은 최소 동작)
                if weekday >= 5:
                    logger.info("주말(토/일)은 대기 모드입니다. 매매 처리를 생략합니다.")
                    await asyncio.sleep(300) # 5분 대기
                    continue
                
                # 오전 06:00 ~ 08:59: 당일 매매 준비 상태 (전일 및 사전 정보 수집)
                if "06:00" <= current_time_str < "09:00":
                    if self._pre_market_notified_date != current_date_str:
                        logger.info("오전 06:00 당일 자동 매매 데이터 준비 단계 가동")
                        await self._perform_pre_market_prep(settings, current_date_str)
                        self._pre_market_notified_date = current_date_str
                    await asyncio.sleep(60) # 1분 대기
                    continue
                
                # 오전 09:00 ~ 오후 15:30: 정규장 실시간 초정밀 감시 및 돌파 매매
                elif "09:00" <= current_time_str <= "15:30":
                    await self._execute_active_trading(settings)
                    await asyncio.sleep(10)
                    continue
                
                # 오후 15:31 ~ 15:59: 장 마감 후 정리 및 미청산 매매 쿨다운 감시
                elif "15:30" < current_time_str < "16:00":
                    await self._execute_post_market_cooling(settings)
                    await asyncio.sleep(10)
                    continue
                
                # 오후 16:00 ~ 16:30: 당일 손익 결산 보고 및 다음 영업일 매매 종목 탐색
                elif "16:00" <= current_time_str <= "16:30":
                    if settlement_done_date != current_date_str:
                        await self._perform_daily_settlement(settings, current_date_str, weekday == 4)
                        settlement_done_date = current_date_str
                    await asyncio.sleep(60)
                    continue
                
                # 16:31 ~ 익일 05:59: 야간 휴식 및 시스템 대기 모드
                else:
                    await asyncio.sleep(300) # 5분 대기
                    continue

            except Exception as e:
                logger.error(f"TradingExecutor 메인 루프 중 예외 발생: {e}")
                await asyncio.sleep(10)

    async def _perform_pre_market_prep(self, settings, date_str):
        """오전 06:00 전일 파악된 정보 활용 및 당일 주도 업종 초기 분석"""
        try:
            exclude_ratio = settings.get("exclude_sector_ratio", 10.0)
            algs = settings.get("algorithms", [])
            
            provider = settings.get("api_provider", "kis")
            active_client = self.toss_client if provider == "toss" else self.kis_client
            
            # 이전 일자 정보 활용을 위한 리포트 초기 구성
            analysis = self.liquidity_engine.analyze_market_liquidity(exclude_ratio=exclude_ratio, algorithms=algs)
            recs = analysis.get("recommendations", [])
            
            rec_names = [f"{r['name']}({r['sector']})" for r in recs[:3]]
            rec_str = ", ".join(rec_names) if rec_names else "지표 모니터링 대기중"
            
            # 알림 발송
            msg = (
                f"[Antigravity] 06:00 자동 단타 매매 분석 가동\n"
                f"- 일자: {date_str}\n"
                f"- 모드: {provider.upper()} API 실데이터 모니터링\n"
                f"- 실시간 감시 대장주: {rec_str}\n"
                f"- 장 개시(09:00) 시 즉시 신호 돌입 대기 완료."
            )
            await TelegramNotifier.send_message(msg)
        except Exception as e:
            logger.error(f"Pre-market 준비 작업 실패: {e}")

    async def _execute_active_trading(self, settings):
        """09:00 ~ 15:30 주도 섹터 매수/매도 실시간 처리"""
        provider = settings.get("api_provider", "kis")
        active_client = self.toss_client if provider == "toss" else self.kis_client
        
        # 1. API 비활성화 시 모의 시뮬레이터로 우회
        if not active_client.is_active:
            await self._run_simulated_trading()
            return

        exclude_ratio = settings.get("exclude_sector_ratio", 10.0)
        algs = settings.get("algorithms", [])
        
        # 유동성 엔진에서 추천 종목 획득
        analysis = self.liquidity_engine.analyze_market_liquidity(exclude_ratio=exclude_ratio, algorithms=algs)
        recs = analysis.get("recommendations", [])
        
        # 매수 진입 검사
        for rec in recs:
            symbol = rec["code"]
            name = rec["name"]
            
            if symbol in self.active_positions:
                continue
                
            # 차트/지표 획득
            candles = []
            if provider == "toss":
                candles_data = active_client.get_daily_chart(symbol, interval="1m", count=30)
                candles = [float(c["close"]) for c in candles_data]
            else:
                chart_data = active_client.get_daily_chart(symbol)
                candles = [float(c["close"]) for c in chart_data]

            if len(candles) < 15:
                continue

            rsi = calculate_rsi(candles)
            macd_val, signal_val, macd_hist = calculate_macd(candles)
            
            trigger_buy = False
            triggered_algo = ""
            
            for alg in algs:
                if not alg.get("is_active"):
                    continue
                alg_id = alg.get("id")
                
                if alg_id == "macd_rsi":
                    rsi_buy_limit = alg.get("rsi_buy_limit", 30)
                    if rsi <= rsi_buy_limit and macd_hist >= -1.0:
                        trigger_buy = True
                        triggered_algo = alg_id
                        break
                elif alg_id == "psar_breakout":
                    if len(candles) >= 3 and candles[-1] > candles[-2] and candles[-2] > candles[-3]:
                        trigger_buy = True
                        triggered_algo = alg_id
                        break

            if trigger_buy:
                current_price = candles[-1]
                alloc_capital = 200000.0
                qty = max(1, int(alloc_capital // current_price))
                
                logger.info(f"[자동매수 시그널 포착] {name}({symbol}) - 가격: {current_price}원, 알고리즘: {triggered_algo}")
                
                order_res = active_client.send_order(code=symbol, order_type="BUY", qty=qty)
                if order_res and order_res.get("rt_cd", "0") == "0":
                    self.active_positions[symbol] = {
                        "buy_price": current_price,
                        "qty": qty,
                        "peak_price": current_price,
                        "buy_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        "algo_id": triggered_algo,
                        "name": name
                    }
                    DatabaseManager.insert_trade_log(
                        algo_id=triggered_algo,
                        code=symbol,
                        name=name,
                        log_type="진입",
                        profit_rate=0.0,
                        buy_price=current_price,
                        sell_price=0.0
                    )
                    await self.ws_manager.broadcast({
                        "type": "order_log",
                        "time": datetime.now().strftime("%H:%M:%S"),
                        "order_type": "매수",
                        "price": f"{int(current_price):,}원",
                        "status": f"[{rec['sector']}] {name} 매수 포착 체결 ({triggered_algo})"
                    })
                    msg_text = f"[Antigravity] 매수 체결 알림\n- 종목: {name}({symbol})\n- 체결가: {int(current_price):,}원\n- 수량: {qty}주\n- 알고리즘: {triggered_algo}"
                    asyncio.create_task(TelegramNotifier.send_message(msg_text))

        # 보유 잔고 매칭 청산 감시
        await self._check_active_positions_exits(active_client, settings)

    async def _execute_post_market_cooling(self, settings):
        """15:30 ~ 16:00: 신규 진입 없이 잔여 포지션 감시 및 청산만 가동"""
        provider = settings.get("api_provider", "kis")
        active_client = self.toss_client if provider == "toss" else self.kis_client
        if active_client.is_active:
            await self._check_active_positions_exits(active_client, settings)

    async def _check_active_positions_exits(self, active_client, settings):
        """보유 종목에 대한 손절선 및 트레일링 스탑 적용 처리"""
        for symbol, pos in list(self.active_positions.items()):
            prices_data = active_client.get_prices(symbol)
            if not prices_data:
                continue
            current_price = float(prices_data[0].get("lastPrice", pos["buy_price"]))
            
            if current_price > pos["peak_price"]:
                pos["peak_price"] = current_price
                
            profit_rate = ((current_price - pos["buy_price"]) / pos["buy_price"]) * 100.0
            
            loss_cut_rate = settings.get("loss_cut_rate", -1.0)
            trailing_stop_rate = settings.get("trailing_stop_rate", -0.5)
            profit_target = settings.get("profit_loss_ratio", 2.0)
            
            trigger_sell = False
            sell_reason = ""
            
            if profit_rate <= loss_cut_rate:
                trigger_sell = True
                sell_reason = "손절"
            elif profit_rate >= profit_target and current_price <= pos["peak_price"] * (1 + trailing_stop_rate/100):
                trigger_sell = True
                sell_reason = "익절 (트레일링스탑)"
                
            if trigger_sell:
                logger.info(f"[자동매도 청산 작동] {pos['name']}({symbol}) - 사유: {sell_reason}, 수익률: {round(profit_rate, 2)}%")
                
                order_res = active_client.send_order(code=symbol, order_type="SELL", qty=pos["qty"])
                if order_res and order_res.get("rt_cd", "0") == "0":
                    del self.active_positions[symbol]
                    
                    DatabaseManager.insert_trade_log(
                        algo_id=pos["algo_id"],
                        code=symbol,
                        name=pos["name"],
                        log_type=sell_reason,
                        profit_rate=round(profit_rate, 2),
                        buy_price=pos["buy_price"],
                        sell_price=current_price
                    )
                    await self.ws_manager.broadcast({
                        "type": "order_log",
                        "time": datetime.now().strftime("%H:%M:%S"),
                        "order_type": "매도",
                        "price": f"{int(current_price):,}원",
                        "status": f"{pos['name']} {sell_reason} 청산 완료 (수익률 {round(profit_rate, 2)}%)"
                    })
                    msg_text = f"[Antigravity] 매도 청산 알림\n- 종목: {pos['name']}({symbol})\n- 청산가: {int(current_price):,}원\n- 수익률: {round(profit_rate, 2)}%\n- 사유: {sell_reason}"
                    asyncio.create_task(TelegramNotifier.send_message(msg_text))

    async def _perform_daily_settlement(self, settings, date_str, is_friday):
        """16:00 당일 손익 결산 및 익일 매매 준비"""
        try:
            logger.info("오후 16:00 장마감 일일 손익 정산 및 내일의 매매 정보 추출 가동")
            
            algs = settings.get("algorithms", [])
            provider = settings.get("api_provider", "kis")
            active_client = self.toss_client if provider == "toss" else self.kis_client
            
            # 1. 일일 정산 처리
            days_korean = ["월", "화", "수", "목", "금", "토", "일"]
            kor_day = days_korean[datetime.now().weekday()]
            
            summary_text_lines = []
            for alg in algs:
                alg_id = alg.get("id")
                alg_name = alg.get("name")
                
                # 금일 체결 건수 및 합산 수익률 DB 집계
                count, daily_profit = DatabaseManager.get_daily_trades_count_and_profit(alg_id, date_str)
                
                # 주간 profit_history에 적재
                DatabaseManager.insert_profit_history(alg_id, "weekly", kor_day, daily_profit)
                
                summary_text_lines.append(
                    f" * {alg_name}: {count}건 거래 / 일일 합산 수익률 {round(daily_profit, 2)}%"
                )
                
            # 2. 내일(또는 월요일)의 매매 정보 파악
            exclude_ratio = settings.get("exclude_sector_ratio", 10.0)
            analysis = self.liquidity_engine.analyze_market_liquidity(exclude_ratio=exclude_ratio, algorithms=algs)
            recs = analysis.get("recommendations", [])
            
            tomorrow_lbl = "월요일" if is_friday else "내일"
            rec_names = [f"{r['name']}({r['sector']})" for r in recs[:3]]
            tomorrow_prep_str = ", ".join(rec_names) if rec_names else "조건 충족 종목 미발견"
            
            settlement_msg = (
                f"[Antigravity 일일 자동매매 결산 보고]\n"
                f"- 일자: {date_str} ({kor_day}요일)\n"
                f"- 연계 API: {provider.upper()} 실거래 연동\n"
                f"---------------------------------\n"
                + "\n".join(summary_text_lines) + "\n"
                f"---------------------------------\n"
                f"- [{tomorrow_lbl} 매매 대비 주도 후보군]\n"
                f" * 후보 종목: {tomorrow_prep_str}\n"
                f"※ 결산이 안전하게 정산 및 DuckDB에 기록되었습니다."
            )
            await TelegramNotifier.send_message(settlement_msg)
            logger.info("일일 손익 결산 완료 및 텔레그램 리포트 발송 성공")
        except Exception as e:
            logger.error(f"일일 정산 처리 실패: {e}")

    async def _run_simulated_trading(self):
        """API 비활성화 상태 전용 시뮬레이션 매매"""
        sim_codes = ["005930", "000660", "247540", "068270"]
        sim_names = {"005930": "삼성전자", "000660": "SK하이닉스", "247540": "에코프로비엠", "068270": "셀트리온"}
        
        if random.random() < 0.15:
            code = random.choice(sim_codes)
            if code not in self.active_positions:
                buy_prc = 100000 if code != "000660" else 190000
                self.active_positions[code] = {
                    "buy_price": buy_prc,
                    "qty": 2,
                    "peak_price": buy_prc,
                    "buy_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "algo_id": random.choice(["macd_rsi", "psar_breakout"]),
                    "name": sim_names[code]
                }
                DatabaseManager.insert_trade_log(
                    algo_id=self.active_positions[code]["algo_id"],
                    code=code,
                    name=sim_names[code],
                    log_type="진입",
                    profit_rate=0.0,
                    buy_price=buy_prc,
                    sell_price=0.0
                )
                await self.ws_manager.broadcast({
                    "type": "order_log",
                    "time": datetime.now().strftime("%H:%M:%S"),
                    "order_type": "매수",
                    "price": f"{buy_prc:,}원",
                    "status": f"[가상] {sim_names[code]} 모의 매수 신호 포착 체결"
                })

        for code, pos in list(self.active_positions.items()):
            if random.random() < 0.20:
                del self.active_positions[code]
                profit = random.uniform(-1.5, 3.5)
                sell_prc = int(pos["buy_price"] * (1 + profit / 100))
                
                DatabaseManager.insert_trade_log(
                    algo_id=pos["algo_id"],
                    code=code,
                    name=pos["name"],
                    log_type="익절" if profit > 0 else "손절",
                    profit_rate=round(profit, 2),
                    buy_price=pos["buy_price"],
                    sell_price=sell_prc
                )
                await self.ws_manager.broadcast({
                    "type": "order_log",
                    "time": datetime.now().strftime("%H:%M:%S"),
                    "order_type": "매도",
                    "price": f"{sell_prc:,}원",
                    "status": f"[가상] {pos['name']} 모의 청산 완료 (수익률 {round(profit, 2)}%)"
                })
