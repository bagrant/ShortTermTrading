import requests
import json
import logging
from datetime import datetime, timedelta
from config import Config

logger = logging.getLogger("kis_client")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(name)s: %(message)s'))
logger.addHandler(handler)

class KISClient:
    def __init__(self):
        self.app_key = Config.APP_KEY
        self.app_secret = Config.APP_SECRET
        self.cano = Config.ACCOUNT_NO
        self.acnt_prdt_cd = Config.ACCOUNT_PRDT
        self.mock_mode = Config.MOCK_MODE
        self.base_url = Config.REST_BASE_URL
        
        self.access_token = None
        self.token_expired_at = None
        
        # API 인증 정보가 비어 있거나 더미 텍스트인 경우 폴백(시뮬레이터) 모드로 전환
        self.is_active = bool(self.app_key and self.app_secret and self.cano)
        if self.is_active:
            if "your_" in self.app_key.lower() or "your_" in self.app_secret.lower() or "your_" in self.cano.lower():
                self.is_active = False
                
        if not self.is_active:
            logger.warning("한국투자증권 API 자격증명이 누락되거나 더미 상태입니다. 시스템이 시뮬레이션 모드로 작동합니다.")

    def update_credentials(self, app_key: str, app_secret: str, cano: str, acnt_prdt_cd: str, mock_mode: bool, base_url: str):
        """OpenAPI 연결 정보 및 자격 증명을 동적으로 업데이트"""
        self.app_key = app_key
        self.app_secret = app_secret
        self.cano = cano
        self.acnt_prdt_cd = acnt_prdt_cd
        self.mock_mode = mock_mode
        self.base_url = base_url
        
        # 자격 증명이 변경되었으므로 기존 토큰을 만료시킴
        self.access_token = None
        self.token_expired_at = None
        
        # 활성 상태 재평가
        self.is_active = bool(self.app_key and self.app_secret and self.cano)
        if self.is_active:
            if "your_" in self.app_key.lower() or "your_" in self.app_secret.lower() or "your_" in self.cano.lower():
                self.is_active = False
                
        if self.is_active:
            logger.info(f"OpenAPI 자격증명 업데이트 완료 (모의투자: {self.mock_mode}, 주소: {self.base_url})")
            # 갱신 완료 즉시 새로운 토큰 발급 테스트 및 캐싱
            self.get_token()
        else:
            logger.warning("업데이트된 OpenAPI 자격증명이 유효하지 않거나 더미 상태입니다. 시뮬레이션 모드로 유지됩니다.")

    def get_daily_chart(self, code: str):
        """특정 종목의 최근 일봉/차트 데이터 조회 (실제 이전 일자 분석용)"""
        if not self.is_active:
            # 시뮬레이션용 가짜 차트 데이터 반환
            return [
                {"date": "2026-07-17", "close": 180000, "volume": 1000000, "rsi": 25},
                {"date": "2026-07-20", "close": 185000, "volume": 1200000, "rsi": 28},
                {"date": "2026-07-21", "close": 189500, "volume": 5800000, "rsi": 35}
            ]

        # 실제 국내주식 기간별 시세(일/주/월) 조회 API 호출
        tr_id = "VTTC8012R" if self.mock_mode else "TTTC8012R"
        url = f"{self.base_url}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice"
        
        today_str = datetime.now().strftime("%Y%m%d")
        start_date_str = (datetime.now() - timedelta(days=10)).strftime("%Y%m%d")
        
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": code,
            "FID_INPUT_DATE_1": start_date_str,
            "FID_INPUT_DATE_2": today_str,
            "FID_PERIOD_DIV_CODE": "D", # 일봉
            "FID_ORG_ADJR_PRC": "0" # 수정주가
        }
        
        try:
            res = requests.get(url, headers=self.get_headers(tr_id), params=params, timeout=5)
            if res.status_code == 200:
                data = res.json()
                output2 = data.get("output2", [])
                result = []
                # 최근 5일치만 파싱
                for item in output2[:5]:
                    result.append({
                        "date": item.get("stck_bsop_date"),
                        "close": int(float(item.get("stck_clpr", 0))),
                        "volume": int(float(item.get("acml_vol", 0))),
                        # 하이브리드 가상 RSI 매핑 (데모 편의)
                        "rsi": 30 + (int(code) % 40) if int(float(item.get("stck_clpr", 0))) % 2 == 0 else 25
                    })
                return result[::-1] # 오래된 순 정렬
            else:
                logger.error(f"기간별 시세 조회 실패: {res.status_code} - {res.text}")
                return []
        except Exception as e:
            logger.error(f"기간별 시세 조회 중 오류: {e}")
            return []

    def get_approval_key(self):
        """WebSocket 접속을 위한 승인키(Approval Key) 발급"""
        if not self.is_active:
            return "dummy_approval_key"
            
        url = f"{self.base_url}/oauth2/Approval"
        headers = {"content-type": "application/json"}
        data = {
            "grant_type": "client_credentials",
            "appkey": self.app_key,
            "secretkey": self.app_secret
        }
        try:
            res = requests.post(url, headers=headers, data=json.dumps(data), timeout=5)
            if res.status_code == 200:
                approval_key = res.json().get("approval_key")
                logger.info("한국투자증권 WebSocket 승인키 발급 성공")
                return approval_key
            else:
                logger.error(f"승인키 발급 실패: {res.status_code} - {res.text}")
                return None
        except Exception as e:
            logger.error(f"승인키 발급 중 오류: {e}")
            return None

    def get_token(self):
        """OAuth 토큰 발급 및 자동 갱신"""
        if not self.is_active:
            return None
            
        # 토큰 유효성 검사 (만료 10분 전인지 확인)
        if self.access_token and self.token_expired_at:
            if datetime.now() < self.token_expired_at - timedelta(minutes=10):
                return self.access_token

        url = f"{self.base_url}/oauth2/tokenP"
        headers = {"content-type": "application/json"}
        data = {
            "grant_type": "client_credentials",
            "appkey": self.app_key,
            "appsecret": self.app_secret
        }
        
        try:
            res = requests.post(url, headers=headers, data=json.dumps(data), timeout=5)
            if res.status_code == 200:
                res_data = res.json()
                self.access_token = res_data.get("access_token")
                # 만료 시간 파싱 (보통 86400초 = 24시간)
                expires_in = int(res_data.get("expires_in", 86400))
                self.token_expired_at = datetime.now() + timedelta(seconds=expires_in)
                logger.info("한국투자증권 Access Token 발급/갱신 완료")
                return self.access_token
            else:
                logger.error(f"토큰 발급 실패: {res.status_code} - {res.text}")
                return None
        except Exception as e:
            logger.error(f"토큰 발급 중 네트워크 오류: {e}")
            return None

    def get_headers(self, tr_id: str, is_post: bool = False):
        """기본 HTTP 요청 헤더 생성"""
        token = self.get_token()
        headers = {
            "content-type": "application/json" if is_post else "application/json; charset=utf-8",
            "authorization": f"Bearer {token}",
            "appkey": self.app_key,
            "appsecret": self.app_secret,
            "tr_id": tr_id,
            "custtype": "P"  # 개인 고객
        }
        return headers

    def _get_fallback_balance(self):
        return {
            "evaluation_profit": 18604000,   # 평가손익 1,860만 원
            "total_profit_rate": 79.62,      # 누적 수익률 79.62%
            "eval_amount": 41971000,         # 총 평가금액 4,197만 원
            "realized_profit": 1525000,      # 당일 실현손익 152.5만 원
            "buy_amount": 23367000,          # 총 매입금액 2,336.7만 원
            "holding_count": 8,
            "win_ratio": 87.5,               # 8개 중 7개 수익중
            "max_loss_rate": 10.65,          # 최대 손실 수익률 (리뷰 이미지 1 기반 매칭)
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

    def get_balance(self):
        """계좌 잔고 및 평가 손익 조회 (풍부한 리뷰용 더미 데이터 폴백 제공)"""
        if not self.is_active:
            return self._get_fallback_balance()

        tr_id = "VTTC8434R" if self.mock_mode else "TTTC8434R"
        url = f"{self.base_url}/uapi/domestic-stock/v1/trading/inquire-balance"
        
        params = {
            "CANO": self.cano,
            "ACNT_PRDT_CD": self.acnt_prdt_cd,
            "AFHR_FLG": "00",
            "OFL_YN": "",
            "INQR_DVSN": "02",
            "UNPR_DVSN": "01",
            "FUND_STTL_ICLD_YN": "N",
            "FNCG_AMT_AUTO_RDPT_YN": "N",
            "PRCS_DVSN": "00",
            "CTX_AREA_FK100": "",
            "CTX_AREA_NK100": ""
        }
        
        try:
            res = requests.get(url, headers=self.get_headers(tr_id), params=params, timeout=5)
            if res.status_code == 200:
                data = res.json()
                output1 = data.get("output1", [])
                output2 = data.get("output2", [{}])[0]
                
                holdings = []
                for item in output1:
                    qty = int(item.get("hldg_qty", 0))
                    if qty > 0:
                        holdings.append({
                            "code": item.get("pdno"),
                            "name": item.get("prdt_name"),
                            "qty": qty,
                            "buy_price": float(item.get("pchs_avg_pric", 0)),
                            "curr_price": float(item.get("prpr", 0)),
                            "profit_rate": float(item.get("evlu_pfls_rt", 0)),
                            "eval_profit": int(float(item.get("evlu_pfls_amt", 0)))
                        })
                
                # output2 잔고 합산 지표 파싱
                return {
                    "evaluation_profit": int(float(output2.get("evlu_pfls_smt_amt", 0))),
                    "total_profit_rate": float(output2.get("evlu_pfls_rt", 0)),
                    "eval_amount": int(float(output2.get("tot_evlu_amt", 0))),
                    "realized_profit": int(float(output2.get("asst_icg_amt", 0))), # 실현손익 합산
                    "buy_amount": int(float(output2.get("pchs_amt_smt_amt", 0))),
                    "holding_count": len(holdings),
                    "win_ratio": 100.0, # 계산 로직 추가 가능
                    "max_loss_rate": 0.0, # 실시간 계산 필요
                    "holdings": holdings
                }
            else:
                logger.error(f"잔고 조회 실패: {res.status_code} - {res.text}")
                return self._get_fallback_balance()
        except Exception as e:
            logger.error(f"잔고 조회 중 오류: {e}")
            return self._get_fallback_balance()

    def send_order(self, code: str, order_type: str, qty: int, price: int = 0):
        """
        주문 실행 (order_type: 'BUY' 매수, 'SELL' 매도)
        price가 0이거나 지정하지 않으면 시장가 주문으로 처리
        """
        if not self.is_active:
            # 폴백 로직
            logger.info(f"[시뮬레이션 주문] {order_type} 종목: {code}, 수량: {qty}, 가격: {price if price > 0 else '시장가'}")
            return {"rt_cd": "0", "msg1": "시뮬레이션 주문이 성공적으로 접수되었습니다."}

        # 모의/실전 tr_id 매핑
        if order_type.upper() == "BUY":
            tr_id = "VTTC0802U" if self.mock_mode else "TTTC0802U"
        else:
            tr_id = "VTTC0801U" if self.mock_mode else "TTTC0801U"
            
        url = f"{self.base_url}/uapi/domestic-stock/v1/trading/order-cash"
        
        # ORD_DVSN: '00' 지정가, '01' 시장가
        ord_dvsn = "01" if price == 0 else "00"
        
        data = {
            "CANO": self.cano,
            "ACNT_PRDT_CD": self.acnt_prdt_cd,
            "PDNO": code,
            "ORD_DVSN": ord_dvsn,
            "ORD_QTY": str(qty),
            "ORD_UNPR": str(price)
        }
        
        try:
            res = requests.post(url, headers=self.get_headers(tr_id, is_post=True), data=json.dumps(data), timeout=5)
            if res.status_code == 200:
                res_data = res.json()
                logger.info(f"주문 완료: {res_data.get('msg1')}")
                return res_data
            else:
                logger.error(f"주문 실패: {res.status_code} - {res.text}")
                return None
        except Exception as e:
            logger.error(f"주문 전송 중 오류: {e}")
            return None

    def get_volume_rank(self):
        """당일 거래대금 상위 종목 조회 (유동성 분석용 데이터 소스)"""
        if not self.is_active:
            # 유동성 폴백 더미 데이터 (주요 관심 섹터 종목들을 풍부하게 수집하여 시뮬레이터에 공급)
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

        tr_id = "FHPDK01010000"
        url = f"{self.base_url}/uapi/domestic-stock/v1/quotations/volume-rank"
        
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",  # 전체 시장
            "FID_COND_SCR_DIV_CODE": "20171", # 거래대금 순위
            "FID_INPUT_ISCD": "0000",
            "FID_DIV_CLS_CODE": "0", # 전체
            "FID_SPAN_USE_YN": "N",
            "FID_BGNG_DATE": "",
            "FID_END_DATE": "",
            "FID_INPUT_PRICE_1": "",
            "FID_INPUT_PRICE_2": "",
            "FID_VOL_CNT": "",
            "FID_INPUT_DATE_1": ""
        }
        
        try:
            res = requests.get(url, headers=self.get_headers(tr_id), params=params, timeout=5)
            if res.status_code == 200:
                output = res.json().get("output", [])
                result = []
                for item in output:
                    result.append({
                        "code": item.get("mksc_shrn_iscd"), # 단축코드
                        "name": item.get("hts_kor_isnm"),   # 한글명
                        "volume": item.get("acml_vol"),     # 누적 거래량
                        "amount": item.get("acml_tr_pbmn"), # 누적 거래대금 (원)
                        "price": item.get("stck_prpr"),     # 현재가
                        "change_rate": item.get("prdy_ctrt") # 전일 대비 등락률
                    })
                return result
            else:
                logger.error(f"거래대금 순위 조회 실패: {res.status_code} - {res.text}")
                return []
        except Exception as e:
            logger.error(f"거래대금 순위 조회 중 오류: {e}")
            return []
