import React, { useState, useEffect } from 'react';
import { Flame, ShieldAlert, CheckCircle, RefreshCw } from 'lucide-react';

export default function LiquidityTab({ liquidityData, onRefresh, settings, onUpdateSettings }) {
  const currentRatio = settings?.exclude_sector_ratio ?? 10.0;
  const [localRatio, setLocalRatio] = useState(currentRatio);

  useEffect(() => {
    setLocalRatio(currentRatio);
  }, [currentRatio]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (onUpdateSettings && localRatio !== currentRatio) {
        onUpdateSettings({ exclude_sector_ratio: localRatio });
      }
    }, 400);
    return () => clearTimeout(handler);
  }, [localRatio]);

  if (!liquidityData) return (
    <div className="flex items-center justify-center h-64 text-slate-400">
      유동성 흐름 데이터 분석 중...
    </div>
  );

  return (
    <div className="space-y-6">
      
      {/* Top Banner and Actions */}
      <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div>
          <h2 className="text-slate-100 font-bold text-base flex items-center gap-2">
            <Flame className="text-amber-500 animate-pulse" size={20} /> 실시간 시장 유동성 및 주도 테마 분석
          </h2>
          <p className="text-xs text-slate-400 mt-1">매일 아침 시장의 돈이 흐르는 섹터로 집중 배팅하고 소외 섹터는 완벽히 거릅니다.</p>
        </div>
        <button 
          onClick={onRefresh}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 p-2.5 rounded-lg transition"
          title="유동성 데이터 갱신"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Grid Block: Heatmap & Blacklist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 섹터별 자금 유입 지도 (Heatmap) */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <h3 className="text-slate-200 font-bold text-sm mb-4">섹터별 자금 유입 지도 (Heatmap)</h3>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {liquidityData.sectors.map((sec, idx) => {
              // 점수에 따른 배경색 밝기 설정
              let bgOpacity = "bg-slate-950";
              let textColor = "text-slate-400";
              let borderColor = "border-slate-800";
              
              if (sec.score === 0 || sec.status === "소외섹터") {
                bgOpacity = "bg-slate-950/30 opacity-40";
                textColor = "text-slate-500";
                borderColor = "border-slate-900/60";
              } else if (sec.score >= 80) {
                bgOpacity = "bg-rose-950/40";
                textColor = "text-rose-400";
                borderColor = "border-rose-800";
              } else if (sec.score >= 50) {
                bgOpacity = "bg-amber-950/30";
                textColor = "text-amber-400";
                borderColor = "border-amber-900";
              } else {
                bgOpacity = "bg-slate-950";
                textColor = "text-slate-400";
                borderColor = "border-slate-800";
              }

              return (
                <div 
                  key={idx} 
                  className={`p-4 rounded-xl border ${borderColor} ${bgOpacity} transition flex flex-col justify-between h-28`}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-sm text-slate-100">{sec.name}</span>
                    <span className="text-xs font-semibold">{sec.ratio}%</span>
                  </div>
                  <div className="mt-2">
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${(sec.score === 0 || sec.status === "소외섹터") ? 'bg-slate-700' : (sec.score >= 80 ? 'bg-rose-500' : (sec.score >= 50 ? 'bg-amber-500' : 'bg-slate-600'))}`}
                        style={{ width: `${sec.score === 0 ? 5 : sec.score}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-[10px] mt-1">
                    <span className={textColor}>{sec.status}</span>
                    <span className="text-slate-400 font-semibold">{sec.score}점</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 유동성 배제 리스트 (Blacklist) */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-col justify-between">
          <div>
            <h3 className="text-slate-200 font-bold text-sm mb-2 flex items-center gap-1.5">
              <ShieldAlert className="text-red-400" size={18} /> 실시간 거래 배제 섹터
            </h3>
            <p className="text-xs text-slate-400 mb-4">거래대금 회전율 저하 및 슬리피지 방지를 위해 자동 매수 대상에서 강제 필터링 제외합니다.</p>
            
            {/* 배제 비율 설정 슬라이더 */}
            <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-lg mb-4 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-medium">배제 기준 비율 설정</span>
                <span className="text-blue-400 font-bold font-mono">{localRatio}% 이하</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="30" 
                step="0.5" 
                value={localRatio} 
                onChange={(e) => setLocalRatio(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                <span>0%</span>
                <span>15%</span>
                <span>30%</span>
              </div>
            </div>

            <div className="space-y-2">
              {liquidityData.blacklist_sectors.length > 0 ? (
                liquidityData.blacklist_sectors.map((name, idx) => (
                  <div key={idx} className="bg-red-950/20 border border-red-900/50 p-3 rounded-lg text-xs flex items-center justify-between">
                    <span className="text-red-400 font-bold">{name}</span>
                    <span className="text-slate-500">유동성 경고 (진입 불가)</span>
                  </div>
                ))
              ) : (
                <div className="text-slate-500 text-xs text-center py-8">제외된 소외 섹터가 없습니다.</div>
              )}
            </div>
          </div>
          
          <div className="text-[10px] text-slate-500 mt-4 border-t border-slate-800 pt-3">
            ※ 당일 거래대금 하위 30% 이하이거나 최근 1시간 유동성 유입이 없는 업종은 자동 필터링됩니다.
          </div>
        </div>

      </div>

      {/* 당일 주도 섹터 및 추천 종목 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-slate-200 font-bold text-sm mb-4 flex items-center gap-1.5">
          <CheckCircle className="text-emerald-400" size={18} /> 당일 추천 돌파 종목 리스트
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {liquidityData.recommendations.map((rec, idx) => (
            <div key={idx} className="bg-slate-950 border border-slate-800 p-5 rounded-xl space-y-3 relative overflow-hidden hover:border-slate-700 transition duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/5 to-transparent rounded-full -mr-6 -mt-6"></div>
              
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded">
                      {rec.sector} 대장주
                    </span>
                    <span className="bg-blue-500/10 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded">
                      유입 확률 {rec.inflow_probability || rec.ratio || 0}%
                    </span>
                  </div>
                  <h4 className="text-slate-100 font-bold text-lg mt-1">{rec.name}</h4>
                  <div className="text-xs text-slate-500 font-mono -mt-1">{rec.code}</div>
                </div>
                <div className="text-right">
                  <div className="text-slate-100 font-bold text-sm">{rec.price.toLocaleString()}원</div>
                  <div className={`text-xs font-semibold ${rec.change_rate >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {rec.change_rate >= 0 ? '+' : ''}{rec.change_rate}%
                  </div>
                </div>
              </div>

              {/* 포착된 추천 알고리즘 칩 */}
              {rec.applied_algorithms && rec.applied_algorithms.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {rec.applied_algorithms.map((alg, index) => (
                    <span 
                      key={index}
                      className="bg-indigo-950/40 text-indigo-400 border border-indigo-800/50 text-[9px] font-bold px-2 py-0.5 rounded-full"
                    >
                      {alg}
                    </span>
                  ))}
                </div>
              )}

              <div className="bg-slate-900 p-3.5 rounded-lg space-y-2 text-xs">
                <div>
                  <span className="text-slate-400 block font-semibold mb-0.5">이전 일자 차트 분석 결과</span>
                  <span className="text-slate-300 leading-relaxed block">{rec.reason}</span>
                </div>
                <div className="border-t border-slate-800 pt-2">
                  <span className="text-slate-400 block font-semibold mb-0.5">권장 매매 전략</span>
                  <span className="text-slate-300 leading-relaxed block">{rec.strategy}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
