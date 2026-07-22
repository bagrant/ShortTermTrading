import React, { useState, useEffect } from 'react';
import PortfolioTab from './components/PortfolioTab';
import TradingTab from './components/TradingTab';
import LiquidityTab from './components/LiquidityTab';
import ReportTab from './components/ReportTab';
import { Briefcase, Activity, Flame, ShieldAlert, Wifi, TrendingUp } from 'lucide-react';

// 백엔드 API 및 WebSocket URL 동적 결정
const getBackendUrl = (path = '') => {
  const { protocol, hostname, port } = window.location;
  if (port === '5173') {
    return `${protocol}//${hostname}:8001${path}`;
  }
  return `${protocol}//${hostname}${port ? `:${port}` : ''}${path}`;
};

const getWsUrl = (path = '') => {
  const { protocol, hostname, port } = window.location;
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  if (port === '5173') {
    return `${wsProtocol}//${hostname}:8001${path}`;
  }
  return `${wsProtocol}//${hostname}${port ? `:${port}` : ''}${path}`;
};

export default function App() {
  const [activeTab, setActiveTab] = useState('portfolio');
  const [balance, setBalance] = useState(null);
  const [liquidity, setLiquidity] = useState(null);
  const [reportData, setReportData] = useState([]);
  const [ticker, setTicker] = useState(null);
  const [orderLogs, setOrderLogs] = useState([
    { time: '13:45:12', order_type: '매수', price: '77,800원', status: 'RSI 과매도 돌파 진입' },
    { time: '14:30:45', order_type: '매도', price: '78,500원', status: '30% 분할 익절' },
    { time: '15:10:02', order_type: '매도', price: '79,100원', status: '전량 청산' }
  ]);
  const [wsConnected, setWsConnected] = useState(false);
  const [settings, setSettings] = useState({
    is_auto_trading: true,
    loss_cut_rate: -1.0,
    trailing_stop_rate: -0.5,
    rsi_sell_limit: 70,
    profit_loss_ratio: 2.0,
    exclude_sector_ratio: 10.0
  });

  // 1. API 데이터 폴링 함수
  const fetchSettings = async () => {
    try {
      const res = await fetch(getBackendUrl('/api/settings'));
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      console.error("설정 조회 실패:", err);
    }
  };

  const handleUpdateSettings = async (newSettings) => {
    try {
      const res = await fetch(getBackendUrl('/api/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, ...newSettings })
      });
      const result = await res.json();
      if (result.status === 'success') {
        setSettings(result.settings);
        fetchLiquidity(); // 설정 변경 시 섹터 데이터 갱신
      }
    } catch (err) {
      console.error("설정 업데이트 실패:", err);
    }
  };

  // 1. API 데이터 폴링 함수
  const fetchBalance = async () => {
    try {
      const res = await fetch(getBackendUrl('/api/balance'));
      const data = await res.json();
      setBalance(data);
    } catch (err) {
      console.error("잔고 조회 실패:", err);
    }
  };

  const fetchLiquidity = async () => {
    try {
      const res = await fetch(getBackendUrl('/api/liquidity'));
      const data = await res.json();
      setLiquidity(data);
    } catch (err) {
      console.error("유동성 조회 실패:", err);
    }
  };

  const fetchReporting = async () => {
    try {
      const res = await fetch(getBackendUrl('/api/reporting'));
      const data = await res.json();
      setReportData(data);
    } catch (err) {
      console.error("리포트 조회 실패:", err);
    }
  };

  // 주문 전송 핸들러
  const handlePlaceOrder = async (code, orderType, qty, price = 0) => {
    try {
      const res = await fetch(getBackendUrl('/api/order'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, order_type: orderType, qty, price })
      });
      const result = await res.json();
      alert(`주문 결과: ${result.msg1 || '접수 완료'}`);
      // 잔고 갱신
      fetchBalance();
    } catch (err) {
      console.error("주문 전송 오류:", err);
    }
  };

  // 초기 로딩 및 주기적 폴링
  useEffect(() => {
    fetchBalance();
    fetchLiquidity();
    fetchSettings();
    fetchReporting();

    const interval = setInterval(() => {
      fetchBalance();
      fetchLiquidity();
      fetchReporting();
    }, 15000); // 15초 주기 갱신

    return () => clearInterval(interval);
  }, []);

  // 2. WebSocket 실시간 연동
  useEffect(() => {
    let ws;
    const connectWs = () => {
      ws = new WebSocket(getWsUrl('/ws'));

      ws.onopen = () => {
        setWsConnected(true);
        console.log("백엔드 실시간 WebSocket 연결 성공");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'ticker') {
            setTicker(data);
          } else if (data.type === 'order_log') {
            setOrderLogs(prev => [data, ...prev].slice(0, 50));
          }
        } catch (err) {
          console.error("웹소켓 데이터 파싱 에러:", err);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        console.log("WebSocket 종료됨. 3초 후 재연결 시도...");
        setTimeout(connectWs, 3000);
      };

      ws.onerror = (err) => {
        console.error("WebSocket 오류 발생:", err);
        ws.close();
      };
    };

    connectWs();

    return () => {
      if (ws) ws.close();
    };
  }, []);

  const getProviderBadge = () => {
    if (!settings) return null;
    const provider = settings.api_provider || 'kis';
    const isMock = settings.mock_mode !== false;
    
    if (provider === 'kis') {
      const active = settings.api_key && !settings.api_key.includes("your_");
      if (active) {
        return (
          <span className="bg-blue-950/80 text-blue-400 border border-blue-800/30 px-2.5 py-1 rounded-md font-semibold text-[10px] shadow-sm">
            한투 API {isMock ? '모의' : '실전'}
          </span>
        );
      }
    } else if (provider === 'toss') {
      const active = !!settings.toss_client_id;
      if (active) {
        return (
          <span className="bg-indigo-950/80 text-indigo-400 border border-indigo-800/30 px-2.5 py-1 rounded-md font-semibold text-[10px] shadow-sm">
            토스 API {isMock ? '모의' : '실전'}
          </span>
        );
      }
    }
    
    return (
      <span className="bg-amber-950/80 text-amber-400 border border-amber-800/30 px-2.5 py-1 rounded-md font-semibold text-[10px] shadow-sm">
        가상 시뮬레이터
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header Status Bar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="bg-gradient-to-r from-blue-500 to-indigo-500 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-slate-100 shadow-md">
              A
            </span>
            <div>
              <h1 className="text-base font-bold tracking-tight bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
                Antigravity 자동매매 대시보드
              </h1>
              <span className="text-[10px] text-slate-400 block -mt-0.5">80만 원에서 50억 신화 트레이더의 매매 시스템</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            {getProviderBadge()}
            <div className={`hidden sm:flex items-center gap-2 bg-slate-950/60 border px-3 py-1.5 rounded-full transition-all ${settings.is_auto_trading ? 'border-slate-800' : 'border-rose-950/50'}`}>
              <span className={`w-2 h-2 rounded-full ${settings.is_auto_trading ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`}></span>
              <span className={`font-semibold transition-all ${settings.is_auto_trading ? 'text-slate-300' : 'text-rose-400'}`}>
                {settings.is_auto_trading ? '자동 매매 감시 중' : '자동 매매 정지됨'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              <Wifi size={14} className={wsConnected ? "text-blue-400" : "text-red-400"} />
              <span>{wsConnected ? "WebSocket 실시간 연결" : "연결 끊김"}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Navigation Tabs (모바일 터치 가로 스크롤 및 반응형 최적화) */}
        <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl overflow-x-auto scrollbar-none gap-1">
          <button
            onClick={() => setActiveTab('portfolio')}
            className={`flex-1 min-w-[110px] sm:min-w-0 flex items-center justify-center gap-1.5 py-3 px-2 text-[11px] sm:text-xs font-bold rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'portfolio'
                ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Briefcase size={15} /> 종합 자산 현황
          </button>
          <button
            onClick={() => setActiveTab('trading')}
            className={`flex-1 min-w-[110px] sm:min-w-0 flex items-center justify-center gap-1.5 py-3 px-2 text-[11px] sm:text-xs font-bold rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'trading'
                ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity size={15} /> 실시간 트레이딩 뷰
          </button>
          <button
            onClick={() => setActiveTab('liquidity')}
            className={`flex-1 min-w-[110px] sm:min-w-0 flex items-center justify-center gap-1.5 py-3 px-2 text-[11px] sm:text-xs font-bold rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'liquidity'
                ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Flame size={15} /> 당일 유동성/추천주
          </button>
          <button
            onClick={() => setActiveTab('report')}
            className={`flex-1 min-w-[110px] sm:min-w-0 flex items-center justify-center gap-1.5 py-3 px-2 text-[11px] sm:text-xs font-bold rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'report'
                ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp size={15} /> 알고리즘 리포트
          </button>
        </div>

        {/* Tab View Render */}
        <div className="transition-all duration-300">
          {activeTab === 'portfolio' && <PortfolioTab balance={balance} />}
          {activeTab === 'trading' && (
            <TradingTab 
              tickerData={ticker} 
              orderLogs={orderLogs}
              onPlaceOrder={handlePlaceOrder}
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
            />
          )}
          {activeTab === 'liquidity' && (
            <LiquidityTab 
              liquidityData={liquidity} 
              onRefresh={fetchLiquidity}
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
            />
          )}
          {activeTab === 'report' && (
            <ReportTab 
              reportData={reportData} 
              onRefresh={fetchReporting} 
            />
          )}
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-[10px] text-slate-600">
        © 2026 Antigravity ShortTermTrading. All rights reserved. 본 정보는 시뮬레이션 및 데이터 집계를 바탕으로 한 참고자료입니다.
      </footer>
    </div>
  );
}
