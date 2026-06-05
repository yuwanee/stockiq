import { useState } from 'react'
import { ArrowLeft, BarChart2, BookOpen, Target, Building2, AlertCircle } from 'lucide-react'
import type { AnalysisResults, StockResult } from '../types/stock'
import CandlestickChart from '../components/CandlestickChart'
import IndicatorCharts from '../components/IndicatorCharts'
import SignalsList from '../components/SignalsList'
import FundamentalSection from '../components/FundamentalSection'
import SummarySection from '../components/SummarySection'

const TAB_ICONS = {
  technical: <BarChart2 className="w-4 h-4" />,
  fundamental: <BookOpen className="w-4 h-4" />,
  summary: <Target className="w-4 h-4" />,
}

function ActionChip({ action }: { action: string }) {
  const cfg: Record<string, string> = {
    BUY: 'bg-green-500/20 text-green-400 border-green-500/30',
    ACCUMULATE: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    HOLD: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    REDUCE: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    SELL: 'bg-red-500/20 text-red-400 border-red-500/30',
  }
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${cfg[action] || cfg.HOLD}`}>{action}</span>
  )
}

function OverallSummaryPage({ results }: { results: AnalysisResults }) {
  const stocks = Object.values(results).filter((s): s is StockResult => !('error' in s && !s.company_name))
  const sorted = [...stocks].sort((a, b) => b.recommendation.combined_score - a.recommendation.combined_score)

  return (
    <div className="space-y-4">
      <div className="bg-panel border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-slate-200">Portfolio Overview & Rankings</h2>
          <p className="text-xs text-slate-400 mt-0.5">{stocks.length} stock{stocks.length !== 1 ? 's' : ''} analyzed · Sorted by opportunity score</p>
        </div>
        <div className="divide-y divide-border">
          {sorted.map(stock => (
            <div key={stock.symbol} className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-surface rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-accent">{stock.symbol.slice(0, 4)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-white">{stock.symbol}</span>
                  <ActionChip action={stock.recommendation.action} />
                </div>
                <p className="text-xs text-slate-400 truncate">{stock.company_name}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-base font-bold text-white">${stock.current_price.toFixed(2)}</p>
                <p className={`text-xs font-semibold ${stock.recommendation.combined_score >= 60 ? 'text-green-400' : stock.recommendation.combined_score >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>
                  Score: {stock.recommendation.combined_score.toFixed(0)}/100
                </p>
              </div>
              {stock.entry_point.upside_pct !== null && (
                <div className="text-right flex-shrink-0 hidden sm:block">
                  <p className={`text-sm font-bold ${stock.entry_point.upside_pct > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {stock.entry_point.upside_pct > 0 ? '+' : ''}{stock.entry_point.upside_pct.toFixed(1)}%
                  </p>
                  <p className="text-xs text-slate-500">analyst upside</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Comparison table */}
      <div className="bg-panel border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-slate-200">Metric Comparison</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 text-xs text-slate-400 font-medium">Metric</th>
                {sorted.map(s => (
                  <th key={s.symbol} className="text-right p-3 text-xs text-slate-300 font-semibold">{s.symbol}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                { label: 'Price', fn: (s: StockResult) => `$${s.current_price.toFixed(2)}` },
                { label: 'Tech Score', fn: (s: StockResult) => `${s.recommendation.technical_score.toFixed(0)}/100` },
                { label: 'Fund Score', fn: (s: StockResult) => `${s.recommendation.fundamental_score.toFixed(0)}/100` },
                { label: 'P/E', fn: (s: StockResult) => s.fundamental.pe_ratio ? s.fundamental.pe_ratio.toFixed(1) : 'N/A' },
                { label: 'Rev Growth', fn: (s: StockResult) => s.fundamental.revenue_growth ? `${(s.fundamental.revenue_growth * 100).toFixed(1)}%` : 'N/A' },
                { label: 'Net Margin', fn: (s: StockResult) => s.fundamental.profit_margins ? `${(s.fundamental.profit_margins * 100).toFixed(1)}%` : 'N/A' },
                { label: 'Debt/Equity', fn: (s: StockResult) => s.fundamental.debt_to_equity ? s.fundamental.debt_to_equity.toFixed(1) : 'N/A' },
                { label: 'Analyst Target', fn: (s: StockResult) => s.entry_point.target_mean ? `$${s.entry_point.target_mean.toFixed(2)}` : 'N/A' },
              ].map(row => (
                <tr key={row.label} className="hover:bg-surface/50 transition-colors">
                  <td className="p-3 text-xs text-slate-400 font-medium">{row.label}</td>
                  {sorted.map(s => (
                    <td key={s.symbol} className="p-3 text-right text-xs text-slate-200 font-medium">{row.fn(s)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-600 text-center pb-2">
        For informational purposes only. Not financial advice.
      </p>
    </div>
  )
}

interface Props {
  results: AnalysisResults
  onBack: () => void
}

export default function AnalysisPage({ results, onBack }: Props) {
  const symbols = Object.keys(results)
  const [activeSymbol, setActiveSymbol] = useState(symbols[0])
  const [activeTab, setActiveTab] = useState<'technical' | 'fundamental' | 'summary'>('technical')
  const [showOverall, setShowOverall] = useState(false)

  const stock = results[activeSymbol]
  const hasError = !stock || ('error' in stock && !stock.company_name)

  const sr = hasError ? null : (stock as StockResult)
  const candles = sr?.technical.candles ?? []
  const prevClose = candles.length >= 2 ? candles[candles.length - 2].close : null
  const dayChange = sr && prevClose !== null ? sr.current_price - prevClose : null
  const dayChangePct = dayChange !== null && prevClose ? (dayChange / prevClose) * 100 : null

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="bg-panel border-b border-border sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center gap-4 py-3">
            <button onClick={onBack} className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm">
              <ArrowLeft className="w-4 h-4" /><span className="hidden sm:inline">New Search</span>
            </button>
            <div className="flex items-center gap-1.5">
              <BarChart2 className="w-4 h-4 text-accent" />
              <span className="font-semibold text-white text-sm">StockIQ</span>
            </div>
          </div>

          {/* Symbol tabs */}
          <div className="flex gap-1 overflow-x-auto pb-0 -mb-px">
            {symbols.map(sym => {
              const s = results[sym]
              const err = !s || ('error' in s && !s.company_name)
              const act = !err && s.recommendation?.action
              return (
                <button
                  key={sym}
                  onClick={() => { setActiveSymbol(sym); setShowOverall(false) }}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors flex-shrink-0 ${
                    !showOverall && activeSymbol === sym
                      ? 'border-accent text-accent'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {err ? <AlertCircle className="w-3.5 h-3.5 text-red-400" /> : null}
                  {sym}
                  {act && <ActionChip action={act} />}
                </button>
              )
            })}
            {symbols.length > 1 && (
              <button
                onClick={() => setShowOverall(true)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors flex-shrink-0 ${
                  showOverall ? 'border-accent text-accent' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" /> Overview
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-5">
        {showOverall ? (
          <OverallSummaryPage results={results} />
        ) : hasError ? (
          <div className="bg-panel border border-border rounded-xl p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-white mb-2">Analysis Failed</h2>
            <p className="text-slate-400 text-sm">{(stock as any)?.error || 'Unknown error'}</p>
          </div>
        ) : (
          <>
            {/* Stock header */}
            <div className="flex items-start justify-between mb-4 gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold text-white">{stock.symbol}</h1>
                  <ActionChip action={stock.recommendation.action} />
                  {stock.is_etf && (
                    <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30 font-semibold">ETF</span>
                  )}
                  {stock.ai_analysis && (
                    <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full border border-accent/30">AI Enhanced</span>
                  )}
                </div>
                <p className="text-slate-400 text-sm mt-0.5">{stock.company_name}</p>
                <p className="text-xs text-slate-500">
                  {stock.is_etf
                    ? `${stock.etf_data?.category || stock.sector} · ${stock.etf_data?.fund_family || stock.industry}`
                    : `${stock.sector} · ${stock.industry}`}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-3xl font-bold text-white">${stock.current_price.toFixed(2)}</p>
                {dayChange !== null && dayChangePct !== null && (
                  <p className={`text-sm font-semibold ${dayChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {dayChange >= 0 ? '+' : ''}{dayChange.toFixed(2)} ({dayChangePct >= 0 ? '+' : ''}{dayChangePct.toFixed(2)}%)
                  </p>
                )}
                <p className="text-xs text-slate-400">{stock.currency}</p>
              </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex border-b border-border mb-5">
              {(['technical', 'fundamental', 'summary'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                    activeTab === tab ? 'border-accent text-accent' : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {TAB_ICONS[tab]}{tab}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === 'technical' && (
              <div className="space-y-5">
                {/* Price chart */}
                <div className="bg-panel border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-slate-200">Price Chart (1 Year)</h2>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>ATR(14): <span className="text-slate-200 font-medium">${stock.technical.atr.toFixed(2)}</span></span>
                      <span>Support: <span className="text-green-400 font-medium">${stock.technical.support.toFixed(2)}</span></span>
                      <span>Resistance: <span className="text-red-400 font-medium">${stock.technical.resistance.toFixed(2)}</span></span>
                    </div>
                  </div>
                  <CandlestickChart technical={stock.technical} currentPrice={stock.current_price} />
                </div>

                {/* Indicators */}
                <h2 className="text-sm font-semibold text-slate-300">Technical Indicators</h2>
                <IndicatorCharts technical={stock.technical} />

                {/* Signals */}
                <div>
                  <h2 className="text-sm font-semibold text-slate-300 mb-3">
                    Signal Analysis ({stock.technical.signals.length} signals detected)
                  </h2>
                  <SignalsList signals={stock.technical.signals} />
                </div>
              </div>
            )}

            {activeTab === 'fundamental' && (
              <FundamentalSection
                fundamental={stock.fundamental}
                etfData={stock.etf_data}
                isEtf={stock.is_etf}
              />
            )}

            {activeTab === 'summary' && (
              <SummarySection stock={stock} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
