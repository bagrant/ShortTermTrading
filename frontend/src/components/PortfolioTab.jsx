import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Award, DollarSign, List, Percent } from 'lucide-react';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

export default function PortfolioTab({ balance }) {
  if (!balance) return (
    <div className="flex items-center justify-center h-64 text-slate-400">
      계좌 잔고 정보를 불러오는 중...
    </div>
  );

  // 1. 차트 x축 월단위 및 y축 금액 동적 스케일링 데이터 생성
  const getDynamicChartData = () => {
    const data = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const currentDate = new Date();
    const targetVal = balance.eval_amount ? (balance.eval_amount / 10000) : 4197;
    
    // 역사적 데이터 비율 시뮬레이션 (최종 월이 targetVal이 됨)
    const ratios = [0.12, 0.19, 0.28, 0.24, 0.43, 0.57, 1.0];
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const monthName = monthNames[d.getMonth()];
      data.push({
        name: monthName,
        value: Math.round(targetVal * ratios[6 - i])
      });
    }
    return data;
  };
  const dynamicChartData = getDynamicChartData();

  const pieData = balance.holdings.map((h, i) => ({
    name: h.name,
    value: h.qty * h.curr_price
  }));

  const formatKRW = (val) => {
    if (val >= 100000000) {
      return `${(val / 100000000).toFixed(2)}억 원`;
    }
    return `${(val / 10000).toLocaleString(undefined, { maximumFractionDigits: 0 })}만 원`;
  };

  // 2. 보유 종목 매입단가 큰 순 정렬
  const sortedHoldings = [...balance.holdings].sort((a, b) => b.buy_price - a.buy_price);

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
          <div className="flex justify-between items-center text-slate-400 text-xs mb-2">
            <span>실시간 평가손익</span>
            <TrendingUp size={16} className={balance.evaluation_profit >= 0 ? "text-emerald-500" : "text-red-500"} />
          </div>
          <div className={`text-xl font-bold ${balance.evaluation_profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {balance.evaluation_profit >= 0 ? "+" : ""}{balance.evaluation_profit.toLocaleString()}원
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
          <div className="flex justify-between items-center text-slate-400 text-xs mb-2">
            <span>총 수익률</span>
            <Percent size={16} className="text-blue-500" />
          </div>
          <div className={`text-xl font-bold ${balance.total_profit_rate >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {balance.total_profit_rate >= 0 ? "+" : ""}{balance.total_profit_rate.toFixed(2)}%
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
          <div className="flex justify-between items-center text-slate-400 text-xs mb-2">
            <span>총 평가금액</span>
            <Award size={16} className="text-yellow-500" />
          </div>
          <div className="text-xl font-bold text-slate-100">
            {balance.eval_amount.toLocaleString()}원
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
          <div className="flex justify-between items-center text-slate-400 text-xs mb-2">
            <span>당일 실현손익</span>
            <DollarSign size={16} className="text-purple-500" />
          </div>
          <div className="text-xl font-bold text-slate-100">
            {balance.realized_profit.toLocaleString()}원
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg col-span-2 lg:col-span-1">
          <div className="flex justify-between items-center text-slate-400 text-xs mb-2">
            <span>총 매입금액</span>
            <List size={16} className="text-cyan-500" />
          </div>
          <div className="text-xl font-bold text-slate-100">
            {balance.buy_amount.toLocaleString()}원
          </div>
        </div>
      </div>

      {/* Charts Block */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 누적 평가 손익 추이 */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <h3 className="text-slate-300 font-semibold mb-4 text-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span> 누적 평가손익 추이
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dynamicChartData}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} tickFormatter={(v) => `${v}만`} width={60} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 자산군 비중 */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-col justify-between">
          <h3 className="text-slate-300 font-semibold mb-2 text-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> 포트폴리오 비중
          </h3>
 
          <div className="flex flex-row items-center justify-between gap-2 h-64">
            {pieData.length > 0 ? (
              <>
                {/* 왼쪽: 차트 영역 */}
                <div className="flex-1 h-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatKRW(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
 
                {/* 오른쪽: 범례 리스트 (우측 밀착 및 단독 스크롤바 제공) */}
                <div className="w-[135px] flex-shrink-0 bg-slate-950/60 border border-slate-800 p-2.5 pr-2 rounded-xl text-[11px] space-y-2 max-h-[170px] overflow-y-scroll">
                  {pieData.map((entry, index) => {
                    const total = pieData.reduce((sum, item) => sum + item.value, 0);
                    const percent = total > 0 ? ((entry.value / total) * 100).toFixed(1) : 0;
                    return (
                      <div key={index} className="flex items-center gap-2">
                        <span 
                          className="w-2 h-2 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        ></span>
                        <div className="min-w-0 flex-1">
                          <div className="text-slate-300 truncate font-semibold leading-tight" title={entry.name}>
                            {entry.name}
                          </div>
                          <span className="text-slate-500 text-[10px] font-mono block leading-none mt-0.5">{percent}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex-grow flex items-center justify-center h-full">
                <span className="text-slate-500 text-xs">보유 종목이 없습니다.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 보유 현황 리스트 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-slate-200 font-semibold text-sm">보유 종목 잔고 현황</h3>
          <span className="text-xs text-slate-400">보유 종목수: {balance.holding_count}개</span>
        </div>
        
        {/* 높이 제한 및 스크롤바 추가 */}
        <div className="max-h-[320px] overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          <table className="w-full text-left text-sm text-slate-300 relative">
            {/* sticky top-0 속성 추가 */}
            <thead className="bg-slate-950 text-slate-400 text-xs uppercase border-b border-slate-800 sticky top-0 z-10">
              <tr>
                <th className="p-4 text-center w-16">No.</th>
                <th className="p-4">종목명</th>
                <th className="p-4 text-right">매입단가</th>
                <th className="p-4 text-right">현재가</th>
                <th className="p-4 text-right">보유수량</th>
                <th className="p-4 text-right">평가금액</th>
                <th className="p-4 text-right">평가손익</th>
                <th className="p-4 text-right">수익률</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sortedHoldings.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40 transition">
                  <td className="p-4 text-center text-slate-400 font-semibold">
                    {sortedHoldings.length - idx}
                  </td>
                  <td className="p-4 font-medium text-slate-100">
                    <span className="block">{item.name}</span>
                    <span className="text-xs text-slate-500">{item.code}</span>
                  </td>
                  <td className="p-4 text-right">{item.buy_price.toLocaleString()}원</td>
                  <td className="p-4 text-right">{item.curr_price.toLocaleString()}원</td>
                  <td className="p-4 text-right font-semibold">{item.qty}주</td>
                  <td className="p-4 text-right">{(item.qty * item.curr_price).toLocaleString()}원</td>
                  <td className={`p-4 text-right font-semibold ${item.eval_profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {item.eval_profit >= 0 ? "+" : ""}{item.eval_profit.toLocaleString()}원
                  </td>
                  <td className={`p-4 text-right font-bold ${item.profit_rate >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {item.profit_rate >= 0 ? "+" : ""}{item.profit_rate.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
