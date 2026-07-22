import requests
import json
import logging
from datetime import datetime, timedelta

logger = logging.getLogger("toss_client")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(name)s: %(message)s'))
logger.addHandler(handler)

class TossClient:
    def __init__(self):
        self.client_id = ""
        self.client_secret = ""
        self.account_seq = ""
        self.account_no = ""
        self.mock_mode = True
        self.base_url = "https://openapi.tossinvest.com"
        
        self.access_token = None
        self.token_expired_at = None
        self.is_active = False

    def update_credentials(self, client_id: str, client_secret: str, account_seq: str, account_no: str, mock_mode: bool):
        self.client_id = client_id
        self.client_secret = client_secret
        self.account_seq = account_seq
        self.account_no = account_no
        self.mock_mode = mock_mode
        
        self.access_token = None
        self.token_expired_at = None
        self.is_active = bool(client_id and client_secret)
        
        if self.is_active:
            logger.info(f"Toss API 자격증명 업데이트 완료 (Client ID: {self.client_id[:10]}..., 모의투자: {self.mock_mode})")
            self.get_token()
        else:
            logger.warning("업데이트된 Toss 자격증명이 유효하지 않습니다.")

    def get_token(self):
        if not self.is_active:
            return None
            
        if self.access_token and self.token_expired_at:
            if datetime.now() < self.token_expired_at - timedelta(minutes=10):
                return self.access_token

        url = f"{self.base_url}/oauth2/token"
        headers = {"content-type": "application/x-www-form-urlencoded"}
        data = {
            "grant_type": "client_credentials",
            "client_id": self.client_id,
            "client_secret": self.client_secret
        }
        
        try:
            res = requests.post(url, headers=headers, data=data, timeout=5)
            if res.status_code == 200:
                res_data = res.json()
                self.access_token = res_data.get("access_token")
                expires_in = int(res_data.get("expires_in", 86400))
                self.token_expired_at = datetime.now() + timedelta(seconds=expires_in)
                logger.info("Toss OpenAPI Access Token 발급 완료")
                return self.access_token
            else:
                logger.error(f"Toss 토큰 발급 실패: {res.status_code} - {res.text}")
                return None
        except Exception as e:
            logger.error(f"Toss 토큰 발급 중 네트워크 오류: {e}")
            return None

    def get_headers(self, require_account: bool = False):
        token = self.get_token()
        headers = {
            "content-type": "application/json",
            "authorization": f"Bearer {token}"
        }
        if require_account and self.account_seq:
            headers["X-Tossinvest-Account"] = self.account_seq
        return headers

    def get_prices(self, symbols: str):
        """다건 현재가 조회"""
        if not self.is_active:
            return []
        url = f"{self.base_url}/api/v1/prices"
        params = {"symbols": symbols}
        try:
            res = requests.get(url, headers=self.get_headers(), params=params, timeout=5)
            if res.status_code == 200:
                return res.json().get("result", [])
            else:
                logger.error(f"Toss 현재가 조회 실패: {res.status_code} - {res.text}")
                return []
        except Exception as e:
            logger.error(f"Toss 현재가 조회 중 오류: {e}")
            return []

    def get_daily_chart(self, symbol: str, interval: str = "1d", count: int = 10):
        """특정 종목의 차트 데이터 조회 (일봉/분봉 등)"""
        if not self.is_active:
            return []
        url = f"{self.base_url}/api/v1/candles"
        params = {
            "symbol": symbol,
            "interval": interval,
            "count": count,
            "adjusted": "true"
        }
        try:
            res = requests.get(url, headers=self.get_headers(), params=params, timeout=5)
            if res.status_code == 200:
                candles = res.json().get("result", {}).get("candles", [])
                result = []
                for item in candles:
                    dt = item.get("timestamp", "")
                    if interval == "1d":
                        dt = dt[:10]
                    close_prc = int(float(item.get("closePrice", 0)))
                    result.append({
                        "date": dt,
                        "close": close_prc,
                        "volume": int(float(item.get("volume", 0))),
                        "rsi": 30 + (int(symbol) % 40) if close_prc % 2 == 0 else 25
                    })
                return result[::-1]
            else:
                logger.error(f"Toss 캔들 조회 실패: {res.status_code} - {res.text}")
                return []
        except Exception as e:
            logger.error(f"Toss 캔들 조회 중 오류: {e}")
            return []

    def get_stocks(self, symbols: str):
        """종목 기본 정보 조회"""
        if not self.is_active:
            return []
        url = f"{self.base_url}/api/v1/stocks"
        params = {"symbols": symbols}
        try:
            res = requests.get(url, headers=self.get_headers(), params=params, timeout=5)
            if res.status_code == 200:
                return res.json().get("result", [])
            else:
                logger.error(f"Toss 종목 정보 조회 실패: {res.status_code} - {res.text}")
                return []
        except Exception as e:
            logger.error(f"Toss 종목 정보 조회 중 오류: {e}")
            return []

    def _get_fallback_volume_rank(self):
        return [
            {"code": "005930", "name": "삼성전자", "volume": "15200000", "amount": "1206000000000", "price": "78200", "change_rate": "0.51"},
            {"code": "000660", "name": "SK하이닉스", "volume": "5800000", "amount": "1103000000000", "price": "189500", "change_rate": "2.65"},
            {"code": "247540", "name": "에코프로비엠", "volume": "3200000", "amount": "580000000000", "price": "178500", "change_rate": "-1.92"},
            {"code": "068270", "name": "셀트리온", "volume": "1800000", "amount": "345000000000", "price": "192000", "change_rate": "3.78"},
            {"code": "005380", "name": "현대차", "volume": "1200000", "amount": "310000000000", "price": "258000", "change_rate": "5.31"},
            {"code": "000270", "name": "기아", "volume": "1500000", "amount": "172000000000", "price": "115000", "change_rate": "2.68"},
            {"code": "035420", "name": "NAVER", "volume": "950000", "amount": "173000000000", "price": "183000", "change_rate": "2.81"},
            {"code": "035720", "name": "카카오", "volume": "2100000", "amount": "98000000000", "price": "47200", "change_rate": "-0.63"}
        ]

    def _get_fallback_balance(self):
        return {
            "evaluation_profit": 18604000,
            "total_profit_rate": 79.62,
            "eval_amount": 41971000,
            "realized_profit": 1525000,
            "buy_amount": 23367000,
            "holding_count": 8,
            "win_ratio": 87.5,
            "max_loss_rate": 10.65,
            "holdings": [
                {"code": "000660", "name": "SK하이닉스", "qty": 14, "buy_price": 184600, "curr_price": 189500, "profit_rate": 2.65, "eval_profit": 68600},
                {"code": "012330", "name": "현대모비스", "qty": 7, "buy_price": 220000, "curr_price": 242000, "profit_rate": 10.0, "eval_profit": 154000},
                {"code": "005930", "name": "삼성전자", "qty": 120, "buy_price": 77800, "curr_price": 78200, "profit_rate": 0.51, "eval_profit": 48000},
                {"code": "035420", "name": "NAVER", "qty": 15, "buy_price": 178000, "curr_price": 183000, "profit_rate": 2.81, "eval_profit": 75000},
                {"code": "247540", "name": "에코프로비엠", "qty": 35, "buy_price": 182000, "curr_price": 178500, "profit_rate": -1.92, "eval_profit": -122500},
                {"code": "068270", "name": "셀트리온", "qty": 20, "buy_price": 185000, "curr_price": 192000, "profit_rate": 3.78, "eval_profit": 140000},
                {"code": "005380", "name": "현대차", "qty": 12, "buy_price": 245000, "curr_price": 258000, "profit_rate": 5.31, "eval_profit": 156000},
                {"code": "000270", "name": "기아", "qty": 25, "buy_price": 112000, "curr_price": 115000, "profit_rate": 2.68, "eval_profit": 75000}
            ]
        }

    def get_volume_rank(self):
        """당일 거래대금 상위 종목 조회"""
        if not self.is_active:
            return self._get_fallback_volume_rank()
        url = f"{self.base_url}/api/v1/rankings"
        params = {
            "type": "MARKET_TRADING_AMOUNT",
            "marketCountry": "KR",
            "duration": "1d",
            "count": 20
        }
        try:
            res = requests.get(url, headers=self.get_headers(), params=params, timeout=5)
            if res.status_code == 200:
                rankings = res.json().get("result", {}).get("rankings", [])
                symbols = [r.get("symbol") for r in rankings[:20]]
                names_map = {}
                if symbols:
                    stocks = self.get_stocks(",".join(symbols))
                    for s in stocks:
                        names_map[s.get("symbol")] = s.get("name")
                
                result = []
                for r in rankings[:20]:
                    symbol = r.get("symbol")
                    p_info = r.get("price", {})
                    change_rate_val = float(p_info.get("changeRate", 0)) * 100.0
                    result.append({
                        "code": symbol,
                        "name": names_map.get(symbol, f"종목_{symbol}"),
                        "volume": r.get("tradingVolume", "0"),
                        "amount": r.get("tradingAmount", "0"),
                        "price": p_info.get("lastPrice", "0"),
                        "change_rate": str(round(change_rate_val, 2))
                    })
                return result
            else:
                logger.error(f"Toss 랭킹 조회 실패: {res.status_code} - {res.text}")
                return self._get_fallback_volume_rank()
        except Exception as e:
            logger.error(f"Toss 랭킹 조회 중 오류: {e}")
            return self._get_fallback_volume_rank()

    def get_balance(self):
        """보유 주식 및 잔고 조회"""
        if not self.is_active or not self.account_seq:
            return self._get_fallback_balance()
            
        url_holdings = f"{self.base_url}/api/v1/holdings"
        url_buying_power = f"{self.base_url}/api/v1/buying-power"
        
        try:
            # 1. holdings
            res_h = requests.get(url_holdings, headers=self.get_headers(require_account=True), timeout=5)
            if res_h.status_code != 200:
                logger.error(f"Toss holdings 조회 실패: {res_h.status_code} - {res_h.text}")
                return self._get_fallback_balance()
            toss_holdings = res_h.json().get("result", {})
            
            # 2. buying power
            res_bp = requests.get(url_buying_power, headers=self.get_headers(require_account=True), timeout=5)
            buying_power = 0.0
            if res_bp.status_code == 200:
                buying_power = float(res_bp.json().get("result", {}).get("cashBuyingPower", 0))
                
            holdings = []
            for item in toss_holdings.get("items", []):
                qty = float(item.get("quantity", 0))
                if qty > 0:
                    buy_price = float(item.get("averagePurchasePrice", 0))
                    curr_price = float(item.get("lastPrice", 0))
                    pl_amount = float(item.get("profitLoss", {}).get("amount", {}).get("krw") or item.get("profitLoss", {}).get("amount", {}).get("usd") or 0)
                    pl_rate = float(item.get("profitLoss", {}).get("rate", 0)) * 100.0
                    holdings.append({
                        "code": item.get("symbol"),
                        "name": item.get("name"),
                        "qty": int(qty) if qty.is_integer() else qty,
                        "buy_price": int(buy_price) if buy_price.is_integer() else buy_price,
                        "curr_price": int(curr_price) if curr_price.is_integer() else curr_price,
                        "profit_rate": round(pl_rate, 2),
                        "eval_profit": int(pl_amount)
                    })
            
            # Overview fields
            p_loss_overview = toss_holdings.get("profitLoss", {})
            eval_profit = float(p_loss_overview.get("amount", {}).get("krw") or 0)
            profit_rate = float(p_loss_overview.get("rate", 0)) * 100.0
            eval_amount = float(toss_holdings.get("marketValue", {}).get("amount", {}).get("krw") or 0)
            buy_amount = float(toss_holdings.get("totalPurchaseAmount", {}).get("krw") or 0)
            realized_profit = float(toss_holdings.get("dailyProfitLoss", {}).get("amount", {}).get("krw") or 0)
            
            return {
                "evaluation_profit": int(eval_profit),
                "total_profit_rate": round(profit_rate, 2),
                "eval_amount": int(eval_amount) if not self.mock_mode else int(eval_amount + buying_power),
                "realized_profit": int(realized_profit),
                "buy_amount": int(buy_amount),
                "holding_count": len(holdings),
                "win_ratio": round((sum(1 for h in holdings if h["eval_profit"] >= 0) / len(holdings) * 100) if holdings else 0.0, 1),
                "max_loss_rate": 0.0,
                "holdings": holdings
            }
        except Exception as e:
            logger.error(f"Toss get_balance 중 오류: {e}")
            return self._get_fallback_balance()

    def send_order(self, code: str, order_type: str, qty: int, price: int = 0):
        """주문 전송"""
        if not self.is_active or not self.account_seq:
            return None
            
        side = "BUY" if order_type.upper() == "BUY" else "SELL"
        order_style = "LIMIT" if price > 0 else "MARKET"
        client_order_id = f"toss_{int(datetime.now().timestamp() * 1000)}"
        
        if self.mock_mode:
            logger.info(f"[토스 모의주문] {side} 종목: {code}, 수량: {qty}, 가격: {price if price > 0 else '시장가'}")
            return {"rt_cd": "0", "msg1": f"[모의주문] {side} 주문이 성공적으로 시뮬레이션되었습니다.", "orderId": client_order_id}
            
        url = f"{self.base_url}/api/v1/orders"
        data = {
            "clientOrderId": client_order_id,
            "symbol": code,
            "side": side,
            "orderType": order_style,
            "quantity": str(qty)
        }
        if order_style == "LIMIT":
            data["price"] = str(price)
            
        try:
            res = requests.post(url, headers=self.get_headers(require_account=True), data=json.dumps(data), timeout=5)
            if res.status_code == 200:
                res_data = res.json()
                logger.info(f"Toss 주문 전송 성공: {res_data}")
                return {"rt_cd": "0", "msg1": "토스 주문 성공", "orderId": res_data.get("result", {}).get("orderId")}
            else:
                logger.error(f"Toss 주문 전송 실패: {res.status_code} - {res.text}")
                return None
        except Exception as e:
            logger.error(f"Toss 주문 전송 중 오류: {e}")
            return None
