import React, { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Play, Square, Settings, ShieldAlert } from 'lucide-react';

// 차트 상에 매수, 매도 시점을 시각화할 커스텀 도트 마커 컴포넌트
const CustomizedDot = (props) => {
  const { cx, cy, payload } = props;
  
  if (payload.is_buy) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={7} fill="#10b981" stroke="#ffffff" strokeWidth={1.5} />
        <path d={`M ${cx} ${cy + 3} L ${cx} ${cy - 5} M ${cx - 3} ${cy - 2} L ${cx} ${cy - 5} L ${cx + 3} ${cy - 2}`} stroke="#ffffff" strokeWidth={1.5} fill="none" />
        <text x={cx} y={cy - 12} fill="#10b981" fontSize={10} fontWeight="bold" textAnchor="middle" filter="drop-shadow(0px 1px 2px rgba(0,0,0,0.8))">
          매수 ▲
        </text>
      </g>
    );
  }
  
  if (payload.is_sell) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={7} fill="#ef4444" stroke="#ffffff" strokeWidth={1.5} />
        <path d={`M ${cx} ${cy - 3} L ${cx} ${cy + 5} M ${cx - 3} ${cy + 2} L ${cx} ${cy + 5} L ${cx + 3} ${cy + 2}`} stroke="#ffffff" strokeWidth={1.5} fill="none" />
        <text x={cx} y={cy - 12} fill="#ef4444" fontSize={10} fontWeight="bold" textAnchor="middle" filter="drop-shadow(0px 1px 2px rgba(0,0,0,0.8))">
          매도 ▼
        </text>
      </g>
    );
  }
  
  return null;
};

const getBackendUrl = (path = '') => {
  const { protocol, hostname, port } = window.location;
  if (port === '5173') {
    return `${protocol}//${hostname}:8001${path}`;
  }
  return `${protocol}//${hostname}${port ? `:${port}` : ''}${path}`;
};

export default function TradingTab({ tickerData, orderLogs, onPlaceOrder, settings, onUpdateSettings }) {
  const [selectedCode, setSelectedCode] = useState('005930');
  const [chartHistory, setChartHistory] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const currentSettings = settings || {
    is_auto_trading: true,
    loss_cut_rate: -1.0,
    trailing_stop_rate: -0.5,
    rsi_sell_limit: 70,
    profit_loss_ratio: 2.0,
    exclude_sector_ratio: 10.0
  };

  const [tempLossCut, setTempLossCut] = useState(currentSettings.loss_cut_rate);
  const [tempTrailingStop, setTempTrailingStop] = useState(currentSettings.trailing_stop_rate);
  const [tempRsiLimit, setTempRsiLimit] = useState(currentSettings.rsi_sell_limit);
  const [tempRatio, setTempRatio] = useState(currentSettings.profit_loss_ratio);
  const [tempVirtualCapital, setTempVirtualCapital] = useState(currentSettings.virtual_capital || 800000.0);

  const [modalSubTab, setModalSubTab] = useState('api'); // 'api', 'register', 'list'
  
  // OpenAPI 입력 상태
  const [apiProvider, setApiProvider] = useState(currentSettings.api_provider || 'kis');
  const [apiUrl, setApiUrl] = useState(currentSettings.api_url || 'https://openapim.koreainvestment.com:8500');
  const [apiKey, setApiKey] = useState(currentSettings.api_key || '');
  const [apiSecret, setApiSecret] = useState(currentSettings.api_secret || '');
  const [accountNo, setAccountNo] = useState(currentSettings.account_no || '');
  const [accountPrdt, setAccountPrdt] = useState(currentSettings.account_prdt || '01');
  const [mockMode, setMockMode] = useState(currentSettings.mock_mode !== false);
  
  // Toss OpenAPI 입력 상태
  const [tossClientId, setTossClientId] = useState(currentSettings.toss_client_id || '');
  const [tossClientSecret, setTossClientSecret] = useState(currentSettings.toss_client_secret || '');
  const [tossAccountSeq, setTossAccountSeq] = useState(currentSettings.toss_account_seq || '');
  const [tossAccountNo, setTossAccountNo] = useState(currentSettings.toss_account_no || '');

  // Toss 계좌 정보 로컬 목록
  const [tossAccounts, setTossAccounts] = useState([]);
  const [isFetchingToss, setIsFetchingToss] = useState(false);

  const handleFetchTossAccounts = async () => {
    if (!tossClientId || !tossClientSecret) {
      alert("토스증권 Client ID와 Client Secret을 모두 입력해주세요.");
      return;
    }
    setIsFetchingToss(true);
    try {
      const res = await fetch(getBackendUrl('/api/toss/fetch-accounts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: tossClientId, client_secret: tossClientSecret })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setTossAccounts(data.accounts);
        if (data.accounts.length > 0) {
          const first = data.accounts[0];
          setTossAccountNo(first.accountNo);
          setTossAccountSeq(String(first.accountSeq));
          alert(`성공적으로 ${data.accounts.length}개의 계좌 정보를 불러왔습니다.`);
        } else {
          alert("불러온 계좌 정보가 없습니다. 토스 개발자 콘솔 설정을 확인해 주세요.");
        }
      } else {
        alert(`계좌 조회 실패: ${data.detail || '인증 정보 혹은 네트워크 상태를 확인하세요.'}`);
      }
    } catch (err) {
      console.error(err);
      alert("서버 통신 중 오류가 발생했습니다.");
    } finally {
      setIsFetchingToss(false);
    }
  };
  
  // 수동 알고리즘 등록 입력 상태
  const [newAlgoName, setNewAlgoName] = useState('');
  const [newAlgoDesc, setNewAlgoDesc] = useState('');
  const [newAlgoLossCut, setNewAlgoLossCut] = useState(-1.0);
  const [newAlgoTrailingStop, setNewAlgoTrailingStop] = useState(-0.5);
  const [newAlgoRsiBuy, setNewAlgoRsiBuy] = useState(30);
  const [newAlgoRsiSell, setNewAlgoRsiSell] = useState(70);
  
  // 알고리즘 목록 로컬 상태
  const [localAlgos, setLocalAlgos] = useState(currentSettings.algorithms || []);

  useEffect(() => {
    if (settings) {
      setTempLossCut(settings.loss_cut_rate);
      setTempTrailingStop(settings.trailing_stop_rate);
      setTempRsiLimit(settings.rsi_sell_limit);
      setTempRatio(settings.profit_loss_ratio);
      setTempVirtualCapital(settings.virtual_capital || 800000.0);
      
      setApiProvider(settings.api_provider || 'kis');
      setApiUrl(settings.api_url || 'https://openapim.koreainvestment.com:8500');
      setApiKey(settings.api_key || '');
      setApiSecret(settings.api_secret || '');
      setAccountNo(settings.account_no || '');
      setAccountPrdt(settings.account_prdt || '01');
      setMockMode(settings.mock_mode !== false);

      setTossClientId(settings.toss_client_id || '');
      setTossClientSecret(settings.toss_client_secret || '');
      setTossAccountSeq(settings.toss_account_seq || '');
      setTossAccountNo(settings.toss_account_no || '');
      setLocalAlgos(settings.algorithms || []);
    }
  }, [settings]);

  const handleSaveSettings = () => {
    onUpdateSettings({
      loss_cut_rate: parseFloat(tempLossCut),
      trailing_stop_rate: parseFloat(tempTrailingStop),
      rsi_sell_limit: parseInt(tempRsiLimit),
      profit_loss_ratio: parseFloat(tempRatio),
      api_provider: apiProvider,
      api_url: apiUrl,
      api_key: apiKey,
      api_secret: apiSecret,
      account_no: accountNo,
      account_prdt: accountPrdt,
      mock_mode: mockMode,
      toss_client_id: tossClientId,
      toss_client_secret: tossClientSecret,
      toss_account_seq: tossAccountSeq,
      toss_account_no: tossAccountNo,
      virtual_capital: parseFloat(tempVirtualCapital),
      algorithms: localAlgos
    });
    setIsModalOpen(false);
  };

  const handleAddAlgorithm = () => {
    if (!newAlgoName) {
      alert("알고리즘 이름을 입력해주세요.");
      return;
    }
    const newAlgoId = 'custom_' + Date.now();
    const newAlgo = {
      id: newAlgoId,
      name: newAlgoName,
      description: newAlgoDesc || `${newAlgoName} 수동 등록 알고리즘`,
      loss_cut_rate: parseFloat(newAlgoLossCut),
      trailing_stop_rate: parseFloat(newAlgoTrailingStop),
      rsi_buy_limit: parseInt(newAlgoRsiBuy),
      rsi_sell_limit: parseInt(newAlgoRsiSell),
      is_active: true
    };
    
    setLocalAlgos([...localAlgos, newAlgo]);
    
    // 입력 폼 초기화
    setNewAlgoName('');
    setNewAlgoDesc('');
    setNewAlgoLossCut(-1.0);
    setNewAlgoTrailingStop(-0.5);
    setNewAlgoRsiBuy(30);
    setNewAlgoRsiSell(70);
    
    alert("알고리즘이 성공적으로 추가되었습니다. 하단의 '설정 저장'을 완료해야 반영됩니다.");
    setModalSubTab('list');
  };

  const handleToggleAlgo = (id) => {
    const updated = localAlgos.map(alg => {
      if (alg.id === id) {
        return { ...alg, is_active: !alg.is_active };
      }
      return alg;
    });
    setLocalAlgos(updated);
  };

  const handleDeleteAlgo = (id) => {
    if (id === 'macd_rsi' || id === 'psar_breakout') {
      alert("기본 알고리즘은 삭제할 수 없으며, 비활성화만 가능합니다.");
      return;
    }
    if (window.confirm("선택한 알고리즘을 삭제하시겠습니까?")) {
      const updated = localAlgos.filter(alg => alg.id !== id);
      setLocalAlgos(updated);
    }
  };

  const [position, setPosition] = useState({
    code: '005930',
    name: '삼성전자',
    qty: 120,
    buy_price: 77800,
    curr_price: 78200,
    timeframe: '15분',
    buy_count: '1 / 1',
    status: '매도 대기',
    warning: `손절 ${currentSettings.loss_cut_rate}% · Trailing Stop 감시중`
  });

  // 실시간 주가 및 매매 시그널 수신 시 차트 및 포지션 동적 업데이트
  useEffect(() => {
    if (tickerData && tickerData.code === selectedCode) {
      // 1. 포지션 현재가 갱신
      setPosition(prev => {
        if (prev.code === selectedCode) {
          return { ...prev, curr_price: tickerData.price };
        }
        return prev;
      });

      // 2. 실시간 차트 히스토리 누적 및 보조지표 계산
      setChartHistory(prev => {
        const timeStr = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const newPoint = {
          time: timeStr.split(' ')[1] || timeStr,
          price: tickerData.price,
          psar: tickerData.psar || tickerData.price,
          macd: tickerData.macd || 0,
          is_buy: tickerData.is_buy,
          is_sell: tickerData.is_sell
        };

        const updated = [...prev, newPoint];
        if (updated.length > 30) {
          updated.shift();
        }
        return updated;
      });
    }
  }, [tickerData, selectedCode]);

  // 종목 변경 시 차트 초기 덤프 데이터 및 모의 매수/매도 시점 배치
  useEffect(() => {
    const initialData = [];
    let startPrice = selectedCode === '005930' ? 78000 : (selectedCode === '000660' ? 188000 : (selectedCode === '247540' ? 178000 : 180000));
    
    for (let i = 0; i < 25; i++) {
      startPrice += (Math.random() - 0.45) * 200;
      
      // 리뷰용 차트에 매수/매도 타점 미리 매핑 (7번째 봉에 매수, 18번째 봉에 매도)
      let is_buy = i === 6;
      let is_sell = i === 17;

      initialData.push({
        time: `${10 + Math.floor(i/6)}:${(i%6)*10}`,
        price: Math.floor(startPrice),
        psar: Math.floor(startPrice * (1 + (Math.random() - 0.5) * 0.003)),
        macd: (Math.random() - 0.5) * 20,
        is_buy: is_buy,
        is_sell: is_sell
      });
    }
    setChartHistory(initialData);

    const nameMap = { '005930': '삼성전자', '000660': 'SK하이닉스', '035420': 'NAVER', '247540': '에코프로비엠' };
    setPosition({
      code: selectedCode,
      name: nameMap[selectedCode] || '기타종목',
      qty: selectedCode === '005930' ? 120 : (selectedCode === '000660' ? 50 : 80),
      buy_price: selectedCode === '005930' ? 77800 : (selectedCode === '000660' ? 186500 : 179200),
      curr_price: startPrice,
      timeframe: '15분',
      buy_count: '1 / 1',
      status: '매도 대기',
      warning: '손절 -1.0% · Trailing Stop 감시중'
    });
  }, [selectedCode]);

  const profitRate = ((position.curr_price - position.buy_price) / position.buy_price) * 100;

  return (
    <div className="space-y-6">
      {/* Top Status and Selection Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <label className="text-slate-400 text-xs font-semibold">감시 종목 선택</label>
          <select 
            value={selectedCode} 
            onChange={(e) => setSelectedCode(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="005930">삼성전자 (005930)</option>
            <option value="000660">SK하이닉스 (000660)</option>
            <option value="035420">NAVER (035420)</option>
            <option value="247540">에코프로비엠 (247540)</option>
          </select>
        </div>
        <div className="flex gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span> 시뮬레이션 모드 가동중</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-blue-500 rounded-full"></span> 실시간 웹소켓 릴레이: 정상</span>
        </div>
      </div>

      {/* Main Grid: Live Positions & Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Card: 현재 포지션 */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-slate-200 font-bold text-sm">현재 보유 포지션</h3>
              <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-xs font-semibold">보유 중</span>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">종목 정보</span>
                <span className="text-slate-100 font-medium">{position.name} ({position.code})</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">보유 수량</span>
                <span className="text-slate-100 font-semibold">{position.qty}주</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">진입 단가</span>
                <span className="text-slate-100">{position.buy_price.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">현재 시세</span>
                <span className="text-slate-100 font-semibold">{Math.floor(position.curr_price).toLocaleString()}원</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">평가 수익률</span>
                <span className={`font-bold ${profitRate >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {profitRate >= 0 ? "+" : ""}{profitRate.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">당일 매수 횟수</span>
                <span className="text-slate-100">{position.buy_count}회</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 space-y-3">
            <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-400/10 p-2.5 rounded-lg">
              <ShieldAlert size={14} />
              <span>{position.warning}</span>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => onPlaceOrder(selectedCode, 'SELL', position.qty)}
                className="flex-1 bg-red-600 hover:bg-red-500 text-slate-100 font-bold py-2 rounded-lg transition text-sm flex items-center justify-center gap-1"
              >
                긴급 전량 청산
              </button>
            </div>
          </div>
        </div>

        {/* Center/Right Box: 15분봉 미니차트 & MACD */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* 차트 영역 */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-slate-300 font-semibold text-xs flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span> 실시간 미니차트 · PSAR 감시
              </h3>
              <span className="text-xs text-slate-500">상승 추세 ▲</span>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartHistory}>
                  <XAxis dataKey="time" stroke="#475569" fontSize={10} tickLine={false} />
                  <YAxis domain={['auto', 'auto']} stroke="#475569" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                  {/* 실시간 종가 라인 & 커스텀 Dot 마커 적용 */}
                  <Line 
                    type="monotone" 
                    dataKey="price" 
                    stroke="#10b981" 
                    strokeWidth={2} 
                    dot={<CustomizedDot />} 
                  />
                  {/* PSAR 보라색 점 매핑 */}
                  <Line type="monotone" dataKey="psar" stroke="#a855f7" strokeWidth={0} dot={{ r: 2, fill: '#a855f7' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* MACD 보조지표 */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
            <h3 className="text-slate-300 font-semibold text-xs mb-4">MACD 히스토그램 (8, 21, 5)</h3>
            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartHistory}>
                  <XAxis dataKey="time" stroke="#475569" fontSize={10} hide />
                  <YAxis stroke="#475569" fontSize={10} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                  <Bar dataKey="macd" fill="#10b981">
                    {chartHistory.map((entry, index) => (
                      <rect key={`rect-${index}`} fill={entry.macd >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom Grid: 매도 우선순위 및 실시간 로그 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* 로스 카메론 매도 규칙 (유튜브 적용) */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <h3 className="text-slate-200 font-bold text-sm mb-4">실시간 매도/청산 트리거 우선순위</h3>
          <ul className="space-y-2 text-xs">
            <li className="flex justify-between items-center p-2.5 bg-slate-950 border border-slate-800 rounded">
              <span className="text-slate-400">1. 고정 손절선 터치 (진입가 대비 {currentSettings.loss_cut_rate}%)</span>
              <span className="inline-block w-28 text-center flex-shrink-0 bg-red-500/20 text-red-400 py-0.5 rounded font-semibold">즉시 손절</span>
            </li>
            <li className="flex justify-between items-center p-2.5 bg-slate-950 border border-slate-800 rounded">
              <span className="text-slate-400">2. 최고점 대비 {currentSettings.trailing_stop_rate}% 이탈 (Trailing Stop)</span>
              <span className="inline-block w-28 text-center flex-shrink-0 bg-amber-500/20 text-amber-400 py-0.5 rounded font-semibold">이익 보존 청산</span>
            </li>
            <li className="flex justify-between items-center p-2.5 bg-slate-950 border border-slate-800 rounded">
              <span className="text-slate-400">3. 밴드 상단 이탈 + 하락 장악형 음봉 (RSI {'>='} {currentSettings.rsi_sell_limit})</span>
              <span className="inline-block w-28 text-center flex-shrink-0 bg-red-500/20 text-red-400 py-0.5 rounded font-semibold">전량 매도</span>
            </li>
            <li className="flex justify-between items-center p-2.5 bg-slate-950 border border-slate-800 rounded">
              <span className="text-slate-400">4. 목표 수익 청산 (손익비 1:{currentSettings.profit_loss_ratio} 지점 도달)</span>
              <span className="inline-block w-28 text-center flex-shrink-0 bg-emerald-500/20 text-emerald-400 py-0.5 rounded font-semibold">지정가 익절</span>
            </li>
          </ul>
        </div>

        {/* 실시간 신호 로그 */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <h3 className="text-slate-200 font-bold text-sm mb-4">실시간 체결 및 신호 로그</h3>
          <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
            {orderLogs && orderLogs.map((log, idx) => (
              <div key={idx} className="flex items-center gap-3 bg-slate-950 p-2.5 rounded border border-slate-800 text-xs animate-fadeIn">
                <span className="text-slate-500 w-14 flex-shrink-0">{log.time}</span>
                <span className={`font-semibold w-12 flex-shrink-0 ${log.order_type === '매수' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  [{log.order_type}]
                </span>
                <span className="w-20 text-right font-mono flex-shrink-0 text-slate-300">
                  {log.price}
                </span>
                <span className="text-slate-300 flex-1 text-right truncate">
                  {log.status}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Control Action Bar */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-xl text-xs w-full">
        {currentSettings.is_auto_trading ? (
          <button 
            onClick={() => onUpdateSettings({ is_auto_trading: false })}
            className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-1.5 transition"
          >
            <Square size={14} /> 자동매매 일시정지
          </button>
        ) : (
          <button 
            onClick={() => onUpdateSettings({ is_auto_trading: true })}
            className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-slate-100 font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-1.5 transition shadow-md shadow-blue-500/10"
          >
            <Play size={14} /> 자동매매 시작
          </button>
        )}
        
        <button 
          onClick={() => onUpdateSettings({ is_auto_trading: false })}
          className="w-full sm:w-auto bg-red-950 text-red-400 hover:bg-red-900 font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-1.5 transition"
        >
          <Square size={14} /> 매매 긴급 정지
        </button>

        <button 
          onClick={() => setIsModalOpen(true)}
          className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 px-4 rounded-lg flex items-center justify-center gap-1.5 transition"
        >
          <Settings size={14} /> 매매 설정
        </button>

        <span className="w-full sm:w-auto bg-slate-950 border border-slate-800 py-2.5 px-4 rounded-lg text-slate-400 flex items-center justify-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span> 텔레그램 연동 ON
        </span>
      </div>

      {/* 매매 설정 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-50 animate-fadeIn overflow-y-auto p-4">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-xl shadow-2xl space-y-6 my-8">
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-slate-100 font-bold text-lg flex items-center gap-2">
                  <Settings size={20} className="text-blue-400" /> 실시간 매매 및 시스템 설정
                </h3>
                <p className="text-[11px] text-slate-400 mt-1">
                  OpenAPI 계좌 및 연동 정보, 알고리즘 매개변수와 추가 알고리즘을 설정합니다.
                </p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold bg-slate-800 px-2.5 py-1 rounded whitespace-nowrap flex-shrink-0"
              >
                닫기
              </button>
            </div>
            
            {/* Modal Navigation Sub-Tabs */}
            <div className="flex border-b border-slate-800 text-xs">
              <button 
                onClick={() => setModalSubTab('api')}
                className={`flex-1 pb-2 border-b-2 font-bold transition-all ${modalSubTab === 'api' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400'}`}
              >
                OpenAPI 연결
              </button>
              <button 
                onClick={() => setModalSubTab('register')}
                className={`flex-1 pb-2 border-b-2 font-bold transition-all ${modalSubTab === 'register' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400'}`}
              >
                알고리즘 수동등록
              </button>
              <button 
                onClick={() => setModalSubTab('list')}
                className={`flex-1 pb-2 border-b-2 font-bold transition-all ${modalSubTab === 'list' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400'}`}
              >
                알고리즘 관리 ({localAlgos.length})
              </button>
            </div>

            {/* Sub-Tab Contents */}
            <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
              
              {/* 1. OpenAPI 연결 설정 탭 */}
              {modalSubTab === 'api' && (
                <div className="space-y-4">
                  {/* API Provider Switcher */}
                  <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setApiProvider('kis')}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                        apiProvider === 'kis'
                          ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      한국투자증권 (KIS)
                    </button>
                    <button
                      type="button"
                      onClick={() => setApiProvider('toss')}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                        apiProvider === 'toss'
                          ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      토스증권 (Toss)
                    </button>
                  </div>

                  {apiProvider === 'kis' && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-slate-300 text-xs font-semibold">증권사 OpenAPI 주소</label>
                          <input 
                            type="text" 
                            value={apiUrl}
                            onChange={(e) => setApiUrl(e.target.value)}
                            className="bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                            placeholder="https://openapim.koreainvestment.com:8500"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-slate-300 text-xs font-semibold">App Key</label>
                          <input 
                            type="text" 
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 font-mono"
                            placeholder="your_app_key"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-slate-300 text-xs font-semibold">App Secret</label>
                          <input 
                            type="password" 
                            value={apiSecret}
                            onChange={(e) => setApiSecret(e.target.value)}
                            className="bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 font-mono"
                            placeholder="••••••••••••••••"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-2 flex flex-col gap-1.5">
                            <label className="text-slate-300 text-xs font-semibold">종합계좌번호 (앞8자리)</label>
                            <input 
                              type="text" 
                              value={accountNo}
                              onChange={(e) => setAccountNo(e.target.value)}
                              className="bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 font-mono"
                              placeholder="12345678"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-slate-300 text-xs font-semibold">상품코드</label>
                            <input 
                              type="text" 
                              value={accountPrdt}
                              onChange={(e) => setAccountPrdt(e.target.value)}
                              className="bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 font-mono"
                              placeholder="01"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox" 
                            id="mock_mode_chk"
                            checked={mockMode}
                            onChange={(e) => setMockMode(e.target.checked)}
                            className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-700 rounded focus:ring-blue-500"
                          />
                          <label htmlFor="mock_mode_chk" className="text-slate-300 text-xs font-semibold cursor-pointer">
                            API 모의투자 모드로 가동 (선택 해제 시 실전 거래 서버로 접속)
                          </label>
                        </div>
                        {mockMode && (
                          <div className="flex flex-wrap items-center gap-3 pl-7 border-t border-slate-900/60 pt-2.5 animate-fadeIn">
                            <label htmlFor="kis_virtual_capital" className="text-slate-400 text-xs font-semibold flex-shrink-0">가상 자본금 설정:</label>
                            <div className="relative flex items-center">
                              <input 
                                type="number" 
                                id="kis_virtual_capital"
                                value={tempVirtualCapital}
                                onChange={(e) => setTempVirtualCapital(parseFloat(e.target.value) || 0)}
                                className="bg-slate-900 border border-slate-700 text-slate-100 rounded-lg pl-3 pr-8 py-1.5 text-xs focus:outline-none focus:border-blue-500 font-mono w-40"
                                placeholder="800000"
                              />
                              <span className="absolute right-3 text-slate-400 text-[11px]">원</span>
                            </div>
                            <span className="text-[10px] text-slate-500">(설정 금액: <strong className="text-slate-300 font-semibold">{tempVirtualCapital.toLocaleString()}원</strong>) 모의 매매 시 초기 가동 자산으로 책정됩니다.</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {apiProvider === 'toss' && (
                    <>
                      {/* Warning info about Sandbox support */}
                      <div className="bg-indigo-950/40 border border-indigo-800/40 p-3.5 rounded-xl space-y-1.5">
                        <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs">
                          <ShieldAlert size={14} /> 토스증권 OpenAPI 가이드 안내
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          토스증권은 공식적으로 모의투자(샌드박스) 환경을 지원하지 않습니다. 
                          실제 주문 실수 및 자산 손실 방지를 위해 아래 <strong>로컬 모의투자(Dry-Run)</strong>를 체크하여 테스트할 수 있습니다.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-slate-300 text-xs font-semibold">Client ID</label>
                          <input 
                            type="text" 
                            value={tossClientId}
                            onChange={(e) => setTossClientId(e.target.value)}
                            className="bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                            placeholder="tsck_live_..."
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-slate-300 text-xs font-semibold">Client Secret</label>
                          <input 
                            type="password" 
                            value={tossClientSecret}
                            onChange={(e) => setTossClientSecret(e.target.value)}
                            className="bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                            placeholder="tssk_live_..."
                          />
                        </div>
                      </div>

                      {/* Account selection with Fetch Button */}
                      <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-300 text-xs font-semibold">연동 계좌 설정</span>
                          <button
                            type="button"
                            onClick={handleFetchTossAccounts}
                            disabled={isFetchingToss}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800/40 text-slate-100 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
                          >
                            {isFetchingToss ? (
                              <span className="w-3.5 h-3.5 border-2 border-slate-100 border-t-transparent rounded-full animate-spin"></span>
                            ) : null}
                            계좌 정보 불러오기
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-slate-400 text-[10px]">계좌 식별 번호 (Account Seq)</label>
                            <input 
                              type="text"
                              value={tossAccountSeq}
                              onChange={(e) => setTossAccountSeq(e.target.value)}
                              className="bg-slate-900 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                              placeholder="계좌 조회 후 자동 입력 (예: 1)"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-slate-400 text-[10px]">계좌번호 (Account No)</label>
                            <input 
                              type="text"
                              value={tossAccountNo}
                              onChange={(e) => setTossAccountNo(e.target.value)}
                              className="bg-slate-900 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                              placeholder="계좌 조회 후 자동 입력"
                            />
                          </div>
                        </div>

                        {tossAccounts.length > 0 && (
                          <div className="flex flex-col gap-1.5 border-t border-slate-800 pt-2">
                            <label className="text-slate-400 text-[10px]">불러온 계좌 목록 선택</label>
                            <select
                              onChange={(e) => {
                                const val = e.target.value;
                                if (!val) return;
                                const [seq, num] = val.split('|');
                                setTossAccountSeq(seq);
                                setTossAccountNo(num);
                              }}
                              value={`${tossAccountSeq}|${tossAccountNo}`}
                              className="bg-slate-900 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                            >
                              {tossAccounts.map((acc, index) => (
                                <option key={index} value={`${acc.accountSeq}|${acc.accountNo}`}>
                                  {acc.accountNo} (식별번호: {acc.accountSeq}, {acc.accountType})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-3 bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox" 
                            id="mock_mode_chk_toss"
                            checked={mockMode}
                            onChange={(e) => setMockMode(e.target.checked)}
                            className="w-4 h-4 text-indigo-600 bg-slate-900 border-slate-700 rounded focus:ring-indigo-500"
                          />
                          <label htmlFor="mock_mode_chk_toss" className="text-slate-300 text-xs font-semibold cursor-pointer">
                            로컬 모의투자 모드(Dry-Run)로 가동 (체크 시 실제 주문 전송 차단)
                          </label>
                        </div>
                        {mockMode && (
                          <div className="flex flex-wrap items-center gap-3 pl-7 border-t border-slate-900/60 pt-2.5 animate-fadeIn">
                            <label htmlFor="toss_virtual_capital" className="text-slate-400 text-xs font-semibold flex-shrink-0">가상 자본금 설정:</label>
                            <div className="relative flex items-center">
                              <input 
                                type="number" 
                                id="toss_virtual_capital"
                                value={tempVirtualCapital}
                                onChange={(e) => setTempVirtualCapital(parseFloat(e.target.value) || 0)}
                                className="bg-slate-900 border border-slate-700 text-slate-100 rounded-lg pl-3 pr-8 py-1.5 text-xs focus:outline-none focus:border-indigo-500 font-mono w-40"
                                placeholder="800000"
                              />
                              <span className="absolute right-3 text-slate-400 text-[11px]">원</span>
                            </div>
                            <span className="text-[10px] text-slate-500">(설정 금액: <strong className="text-slate-300 font-semibold">{tempVirtualCapital.toLocaleString()}원</strong>) 모의 매매 시 초기 가동 자산으로 책정됩니다.</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  
                  {/* 글로벌 4대 매매변수 추가 */}
                  <div className="border-t border-slate-800 pt-4 space-y-4">
                    <h4 className="text-slate-200 font-bold text-xs">글로벌 매매 파라미터 공통설정</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-slate-300 text-xs">고정 손절 비율 (%)</label>
                        <input 
                          type="number" 
                          step="0.1"
                          value={tempLossCut}
                          onChange={(e) => setTempLossCut(e.target.value)}
                          className="bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-slate-300 text-xs">트레일링 스탑 이탈 비율 (%)</label>
                        <input 
                          type="number" 
                          step="0.05"
                          value={tempTrailingStop}
                          onChange={(e) => setTempTrailingStop(e.target.value)}
                          className="bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-slate-300 text-xs">RSI 과매수 청산 기준</label>
                        <input 
                          type="number" 
                          value={tempRsiLimit}
                          onChange={(e) => setTempRsiLimit(e.target.value)}
                          className="bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-slate-300 text-xs">목표 수익 익절 손익 비율</label>
                        <input 
                          type="number" 
                          step="0.1"
                          value={tempRatio}
                          onChange={(e) => setTempRatio(e.target.value)}
                          className="bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. 알고리즘 수동등록 탭 */}
              {modalSubTab === 'register' && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-slate-300 text-xs font-semibold">알고리즘 명</label>
                    <input 
                      type="text" 
                      value={newAlgoName}
                      onChange={(e) => setNewAlgoName(e.target.value)}
                      className="bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                      placeholder="예: RSI 골든크로스"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-slate-300 text-xs font-semibold">알고리즘 설명</label>
                    <textarea 
                      value={newAlgoDesc}
                      onChange={(e) => setNewAlgoDesc(e.target.value)}
                      className="bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 h-16 resize-none"
                      placeholder="알고리즘의 주된 진입/청산 조건을 입력하세요."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-slate-300 text-xs">개별 손절 비율 (%)</label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={newAlgoLossCut}
                        onChange={(e) => setNewAlgoLossCut(e.target.value)}
                        className="bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-slate-300 text-xs">트레일링 스탑 이탈 비율 (%)</label>
                      <input 
                        type="number" 
                        step="0.05"
                        value={newAlgoTrailingStop}
                        onChange={(e) => setNewAlgoTrailingStop(e.target.value)}
                        className="bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-slate-300 text-xs">매수 진입 RSI 하한값 (RSI &lt;=)</label>
                      <input 
                        type="number" 
                        value={newAlgoRsiBuy}
                        onChange={(e) => setNewAlgoRsiBuy(e.target.value)}
                        className="bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-slate-300 text-xs">매도 청산 RSI 상한값 (RSI &gt;=)</label>
                      <input 
                        type="number" 
                        value={newAlgoRsiSell}
                        onChange={(e) => setNewAlgoRsiSell(e.target.value)}
                        className="bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleAddAlgorithm}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-slate-100 font-bold py-2.5 rounded-lg text-xs transition"
                  >
                    새 알고리즘 추가 등록
                  </button>
                </div>
              )}

              {/* 3. 등록된 알고리즘 리스트 및 활성 스위치 관리 탭 */}
              {modalSubTab === 'list' && (
                <div className="space-y-3">
                  {localAlgos.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-xs">등록된 알고리즘이 없습니다.</div>
                  ) : (
                    localAlgos.map((alg) => (
                      <div key={alg.id} className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center justify-between gap-4">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-100">{alg.name}</span>
                            <span className="text-[9px] text-slate-500 font-mono">({alg.id})</span>
                          </div>
                          <p className="text-[11px] text-slate-400">{alg.description}</p>
                          <div className="flex gap-3 text-[10px] text-slate-500 font-mono pt-1">
                            <span>손절: {alg.loss_cut_rate}%</span>
                            <span>트레일링스탑: {alg.trailing_stop_rate}%</span>
                            <span>RSI: {alg.rsi_buy_limit}~{alg.rsi_sell_limit}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleToggleAlgo(alg.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                              alg.is_active 
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                : 'bg-slate-800 text-slate-400 border border-transparent'
                            }`}
                          >
                            {alg.is_active ? '감시중' : '중지됨'}
                          </button>
                          {alg.id !== 'macd_rsi' && alg.id !== 'psar_breakout' && (
                            <button
                              onClick={() => handleDeleteAlgo(alg.id)}
                              className="bg-red-950/40 hover:bg-red-900/40 text-red-400 px-2 py-1.5 rounded-lg text-xs font-bold transition"
                            >
                              삭제
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

            </div>

            {/* Modal Bottom Actions */}
            <div className="flex gap-3 border-t border-slate-800 pt-4">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl text-xs font-semibold transition"
              >
                취소
              </button>
              <button 
                onClick={handleSaveSettings}
                className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-slate-100 py-2.5 rounded-xl text-xs font-bold transition shadow-lg shadow-blue-500/10"
              >
                설정 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
