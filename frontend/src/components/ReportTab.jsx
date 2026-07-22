import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { TrendingUp, Award, Activity, BarChart2, ShieldAlert, ArrowUpRight, ArrowDownRight, RefreshCw, Calendar } from 'lucide-react';

export default function ReportTab({ reportData, onRefresh }) {
  const [selectedAlgoId, setSelectedAlgoId] = useState(null);
  const [period, setPeriod] = useState('weekly'); // 'weekly', 'monthly', 'yearly'

  if (!reportData || reportData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-80 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 space-y-3">
        <Activity className="text-slate-600 animate-pulse" size={40} />
        <span>분석된 알고리즘 리포트 데이터가 존재하지 않습니다.</span>
        <button 
          onClick={onRefresh} 
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition"
        >
          <RefreshCw size={14} /> 데이터 새로고침
        </button>
      </div>
    );
  }

  // 기본 선택 알고리즘 세팅
  const activeAlgos = reportData.filter(a => a.is_active);
  const displayAlgos = reportData;
  const currentAlgoId = selectedAlgoId || (activeAlgos.length > 0 ? activeAlgos[0].id : reportData[0].id);
  const selectedAlgo = displayAlgos.find(a => a.id === currentAlgoId) || displayAlgos[0];

  // 기간에 따른 수익률 데이터 추출
  const getChartData = () => {
    if (period === 'weekly') return selectedAlgo.weekly_profit || [];
    if (period === 'monthly') return selectedAlgo.monthly_profit || [];
    return selectedAlgo.yearly_profit || [];
  };

  const chartData = getChartData();

  return (
    <div className="space-y-6">
      
      {/* Top Banner and Summary Stats */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div>
          <h2 className="text-slate-100 font-bold text-base flex items-center gap-2">
            <TrendingUp className="text-blue-500" size={20} /> 알고리즘별 모의투자 성과 리포트
          </h2>
          <p className="text-xs text-slate-400 mt-1">등록된 자동매매 알고리즘의 실시간 모의투자 집계 및 주/월/년 누적 성과 보고서입니다.</p>
        </div>
        <div className="flex gap-2 w-full lg:w-auto">
          <button 
            onClick={onRefresh}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 p-2.5 rounded-lg transition"
            title="리포트 데이터 새로고침"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Main Grid Section */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        {/* Left Side: Algorithm Selector & Comparison */}
        <div className="xl:col-span-1 space-y-6">
          
          {/* 알고리즘 목록 */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <h3 className="text-slate-200 font-bold text-xs tracking-wider uppercase">알고리즘 선택</h3>
            <div className="space-y-2">
              {displayAlgos.map((algo) => (
                <button
                  key={algo.id}
                  onClick={() => setSelectedAlgoId(algo.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-all flex flex-col justify-between ${
                    currentAlgoId === algo.id
                      ? 'bg-blue-950/30 border-blue-500/80 shadow-md shadow-blue-500/5'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex justify-between items-start w-full">
                    <span className="font-bold text-sm text-slate-100">{algo.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      algo.is_active 
                        ? 'bg-emerald-500/10 text-emerald-400' 
                        : 'bg-slate-800 text-slate-500'
                    }`}>
                      {algo.is_active ? '감시중' : '비활성'}
                    </span>
                  </div>
                  <div className="mt-4 flex justify-between items-end w-full">
                    <span className="text-[10px] text-slate-500">누적 수익률</span>
                    <span className={`text-base font-bold font-mono ${algo.total_profit_rate >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {algo.total_profit_rate >= 0 ? '+' : ''}{algo.total_profit_rate}%
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 알고리즘 누적 수익률 간단 비교 바 차트 */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <h3 className="text-slate-200 font-bold text-xs tracking-wider uppercase flex items-center gap-1.5">
              <BarChart2 size={16} className="text-indigo-400" /> 수익률 비교 시각화
            </h3>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={displayAlgos}>
                  <XAxis dataKey="name" fontSize={9} tickLine={false} stroke="#475569" hide />
                  <YAxis fontSize={9} stroke="#475569" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                    labelClassName="text-slate-400 text-xs font-bold"
                  />
                  <Bar dataKey="total_profit_rate" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                    {displayAlgos.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.id === currentAlgoId ? '#3b82f6' : '#1e293b'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1">
              {displayAlgos.map((algo, index) => (
                <div key={algo.id} className="flex justify-between items-center text-[10px] text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${algo.id === currentAlgoId ? 'bg-blue-500' : 'bg-slate-800'}`}></span>
                    {algo.name}
                  </span>
                  <span className="font-semibold text-slate-200">{algo.total_profit_rate}%</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Side: Detailed Stats, Chart & Trade Logs */}
        <div className="xl:col-span-3 space-y-6">
          
          {/* Key Metrics Dashboard Card */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase block">누적 수익률</span>
              <div className={`text-xl font-bold font-mono ${selectedAlgo.total_profit_rate >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {selectedAlgo.total_profit_rate >= 0 ? '+' : ''}{selectedAlgo.total_profit_rate}%
              </div>
              <span className="text-[9px] text-slate-400 block">수수료/슬리피지 가산완료</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase block">매매 승률</span>
              <div className="text-xl font-bold font-mono text-slate-100">
                {selectedAlgo.win_ratio}%
              </div>
              <span className="text-[9px] text-slate-400 block">수익 거래 비율</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase block">총 거래 횟수</span>
              <div className="text-xl font-bold font-mono text-slate-100">
                {selectedAlgo.total_trades}회
              </div>
              <span className="text-[9px] text-slate-400 block">일간 거래 누적치</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase block">평균 손익비</span>
              <div className="text-xl font-bold font-mono text-slate-100">
                1 : {selectedAlgo.avg_profit_loss_ratio}
              </div>
              <span className="text-[9px] text-slate-400 block">수익금 대비 손실비</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl col-span-2 md:col-span-1 space-y-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase block">최대 낙폭 (MDD)</span>
              <div className="text-xl font-bold font-mono text-rose-500">
                -{selectedAlgo.mdd}%
              </div>
              <span className="text-[9px] text-slate-400 block">최대 리스크 한도 지표</span>
            </div>

          </div>

          {/* Performance Chart Card */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
              <h3 className="text-slate-200 font-bold text-sm flex items-center gap-1.5">
                <Calendar size={18} className="text-blue-500" /> 알고리즘 누적 수익률 추이
              </h3>
              
              {/* Period Switcher */}
              <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                <button
                  onClick={() => setPeriod('weekly')}
                  className={`px-3 py-1.5 rounded-md font-semibold transition ${
                    period === 'weekly' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  주간
                </button>
                <button
                  onClick={() => setPeriod('monthly')}
                  className={`px-3 py-1.5 rounded-md font-semibold transition ${
                    period === 'monthly' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  월간
                </button>
                <button
                  onClick={() => setPeriod('yearly')}
                  className={`px-3 py-1.5 rounded-md font-semibold transition ${
                    period === 'yearly' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  년간
                </button>
              </div>
            </div>

            <div className="h-64">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" stroke="#475569" fontSize={11} tickLine={false} />
                    <YAxis stroke="#475569" fontSize={11} tickFormatter={(val) => `${val}%`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                      formatter={(value) => [`${value}%`, '누적 수익률']}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="profit" 
                      stroke="#3b82f6" 
                      strokeWidth={2.5} 
                      fillOpacity={1} 
                      fill="url(#colorProfit)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500 text-xs">
                  해당 기간 성과 데이터가 비활성화 상태입니다.
                </div>
              )}
            </div>
          </div>

          {/* Trade Logs Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800">
              <h3 className="text-slate-200 font-bold text-sm">최근 모의투자 자동매매 수행 기록</h3>
              <p className="text-[11px] text-slate-400 mt-1">알고리즘 신호 포착에 의해 체결된 실시간 가상 매매 로그입니다.</p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3.5">체결 일시</th>
                    <th className="px-5 py-3.5">종목코드 / 종목명</th>
                    <th className="px-5 py-3.5 text-center">구분</th>
                    <th className="px-5 py-3.5 text-right">진입가</th>
                    <th className="px-5 py-3.5 text-right">청산가</th>
                    <th className="px-5 py-3.5 text-right">실현 수익률</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {selectedAlgo.trade_logs && selectedAlgo.trade_logs.length > 0 ? (
                    selectedAlgo.trade_logs.map((log, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/20 transition-colors">
                        <td className="px-5 py-3 text-slate-400 font-mono">{log.date}</td>
                        <td className="px-5 py-3 font-medium">
                          <div className="text-slate-100">{log.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{log.code}</div>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                            log.type === '익절' 
                              ? 'bg-emerald-500/10 text-emerald-400' 
                              : 'bg-red-500/10 text-red-400'
                          }`}>
                            {log.type}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-mono">{log.buy_price.toLocaleString()}원</td>
                        <td className="px-5 py-3 text-right font-mono">{log.sell_price.toLocaleString()}원</td>
                        <td className="px-5 py-3 text-right">
                          <span className={`font-bold font-mono inline-flex items-center gap-0.5 ${
                            log.profit_rate >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}>
                            {log.profit_rate >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                            {log.profit_rate >= 0 ? '+' : ''}{log.profit_rate}%
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="text-center py-10 text-slate-500">
                        수행된 가상 매매 내역이 존재하지 않습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
