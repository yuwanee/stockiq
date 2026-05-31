import type { StockResult } from '../types/stock'
import { TrendingUp, TrendingDown, Minus, Target, AlertTriangle, Zap, Clock, PieChart } from 'lucide-react'

function ActionBadge({ action }: { action: string }) {
  const cfg: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    BUY: { bg: 'bg-green-500/20 border-green-500/50', text: 'text-green-400', icon: <TrendingUp className="w-5 h-5" /> },
    ACCUMULATE: { bg: 'bg-emerald-500/20 border-emerald-500/50', text: 'text-emerald-400', icon: <TrendingUp className="w-5 h-5" /> },
    HOLD: { bg: 'bg-yellow-500/20 border-yellow-500/50', text: 'text-yellow-400', icon: <Minus className="w-5 h-5" /> },
    REDUCE: { bg: 'bg-orange-500/20 border-orange-500/50', text: 'text-orange-400', icon: <TrendingDown className="w-5 h-5" /> },
    SELL: { bg: 'bg-red-500/20 border-red-500/50', text: 'text-red-400', icon: <TrendingDown className="w-5 h-5" /> },
  }
  const c = cfg[action] || cfg.HOLD
  return (
    <div className={`inline-flex items-center gap-2 border px-4 py-2 rounded-xl ${c.bg} ${c.text}`}>
      {c.icon}
      <span className="text-xl font-bold">{action}</span>
    </div>
  )
}

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className={`font-semibold ${color}`}>{score.toFixed(0)}/100</span>
      </div>
      <div className="w-full bg-surface rounded-full h-2">
        <div className={`h-2 rounded-full ${color.replace('text-', 'bg-')}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  )
}

function FibTable({ levels, currentPrice }: { levels: Record<string, number>; currentPrice: number }) {
  return (
    <div className="bg-panel border border-border rounded-xl p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Fibonacci Retracement Levels</h3>
      <div className="space-y-1.5">
        {Object.entries(levels).map(([k, v]) => (
          <div key={k} className="flex justify-between items-center">
            <span className="text-xs text-slate-400">{(parseFloat(k) * 100).toFixed(1)}%</span>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${v < currentPrice ? 'text-green-400' : 'text-red-400'}`}>${v.toFixed(2)}</span>
              {Math.abs(v - currentPrice) / currentPrice < 0.03 && (
                <span className="text-xs bg-accent/20 text-accent px-1.5 py-0.5 rounded">Near</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SummarySection({ stock }: { stock: StockResult }) {
  const { recommendation: rec, entry_point, ai_analysis: ai, current_price, technical, fundamental } = stock
  const techColor = rec.technical_score >= 70 ? 'text-green-400' : rec.technical_score >= 45 ? 'text-yellow-400' : 'text-red-400'
  const fundColor = rec.fundamental_score >= 70 ? 'text-green-400' : rec.fundamental_score >= 45 ? 'text-yellow-400' : 'text-red-400'
  const combColor = rec.combined_score >= 70 ? 'text-green-400' : rec.combined_score >= 45 ? 'text-yellow-400' : 'text-red-400'

  return (
    <div className="space-y-4">
      {/* Main Verdict */}
      <div className="bg-panel border border-border rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-400 mb-1">Overall Recommendation</p>
            <ActionBadge action={rec.action} />
            <p className="text-xs text-slate-400 mt-2">Confidence: {rec.confidence}%</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">Current Price</p>
            <p className="text-3xl font-bold text-white">${current_price.toFixed(2)}</p>
            <p className="text-xs text-slate-400">{stock.currency}</p>
          </div>
        </div>

        {/* Score bars */}
        <div className="mt-5 space-y-3">
          <ScoreBar label="Technical Score" score={rec.technical_score} color={techColor} />
          <ScoreBar label="Fundamental Score" score={rec.fundamental_score} color={fundColor} />
          <ScoreBar label="Combined Score" score={rec.combined_score} color={combColor} />
        </div>

        {/* Signal summary */}
        <div className="mt-4 flex gap-3">
          <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-lg">
            <TrendingUp className="w-3 h-3" />{rec.bullish_count} Bullish
          </span>
          <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-lg">
            <TrendingDown className="w-3 h-3" />{rec.bearish_count} Bearish
          </span>
          <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-1 rounded-lg">
            <Minus className="w-3 h-3" />{rec.neutral_count} Neutral
          </span>
        </div>
      </div>

      {/* ETF Quick Stats */}
      {stock.is_etf && stock.etf_data && (() => {
        const p = stock.etf_data.performance_metrics
        const b = stock.etf_data.benchmark_comparison
        const er = stock.etf_data.expense_ratio
        return (
          <div className="bg-panel border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <PieChart className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold text-slate-200">ETF Quality Snapshot</h3>
              <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30 ml-auto">ETF</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Expense Ratio', v: er != null ? `${(er * 100).toFixed(3)}%` : 'N/A', good: er != null ? er < 0.005 : null },
                { label: 'Sharpe Ratio', v: p?.sharpe_ratio != null ? p.sharpe_ratio.toFixed(2) : 'N/A', good: p?.sharpe_ratio != null ? p.sharpe_ratio > 1 : null },
                { label: 'Max Drawdown', v: p?.max_drawdown != null ? `${(p.max_drawdown * 100).toFixed(1)}%` : 'N/A', good: p?.max_drawdown != null ? Math.abs(p.max_drawdown) < 0.2 : null },
                { label: 'Alpha (Ann.)', v: b?.alpha_annualized != null ? `${(b.alpha_annualized * 100).toFixed(2)}%` : 'N/A', good: b?.alpha_annualized != null ? b.alpha_annualized > 0 : null },
                { label: 'Beta', v: b?.beta != null ? b.beta.toFixed(2) : 'N/A', good: null },
                { label: 'Calmar Ratio', v: p?.calmar_ratio != null ? p.calmar_ratio.toFixed(2) : 'N/A', good: p?.calmar_ratio != null ? p.calmar_ratio > 1 : null },
              ].map(m => (
                <div key={m.label} className="bg-surface rounded-lg p-2.5">
                  <p className="text-xs text-slate-400 mb-0.5">{m.label}</p>
                  <p className={`text-base font-bold ${m.good === true ? 'text-green-400' : m.good === false ? 'text-red-400' : 'text-slate-200'}`}>{m.v}</p>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Entry Point */}
      <div className="bg-panel border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold text-slate-200">Entry Point & Price Targets</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-surface rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-1">Suggested Entry</p>
            <p className="text-xl font-bold text-accent">${entry_point.suggested_price.toFixed(2)}</p>
          </div>
          {entry_point.target_mean && (
            <div className="bg-surface rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Analyst Target</p>
              <p className="text-xl font-bold text-slate-200">${entry_point.target_mean.toFixed(2)}</p>
              {entry_point.upside_pct !== null && (
                <p className={`text-xs ${entry_point.upside_pct > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {entry_point.upside_pct > 0 ? '+' : ''}{entry_point.upside_pct.toFixed(1)}% upside
                </p>
              )}
            </div>
          )}
        </div>
        {entry_point.target_low !== null && entry_point.target_high !== null && (
          <div className="flex justify-between text-xs text-slate-400 mb-2">
            <span>Target Low: <span className="text-red-400 font-medium">${entry_point.target_low.toFixed(2)}</span></span>
            <span>Target High: <span className="text-green-400 font-medium">${entry_point.target_high.toFixed(2)}</span></span>
          </div>
        )}
        <div className="flex justify-between text-xs text-slate-400 mb-3">
          <span>Support: <span className="text-green-400 font-medium">${technical.support.toFixed(2)}</span></span>
          <span>Resistance: <span className="text-red-400 font-medium">${technical.resistance.toFixed(2)}</span></span>
        </div>
        <p className="text-xs text-slate-300 bg-surface rounded-lg p-2.5">{entry_point.note}</p>
      </div>

      {/* AI Analysis */}
      {ai && (
        <>
          <div className="bg-panel border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-semibold text-slate-200">AI Investment Thesis</h3>
              <span className="text-xs bg-accent/20 text-accent px-1.5 py-0.5 rounded ml-auto">Claude</span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{ai.investment_thesis}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-panel border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-semibold text-slate-200">Key Risks</h3>
              </div>
              <ul className="space-y-1.5">
                {ai.key_risks.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="text-red-400 mt-0.5">•</span>{r}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-panel border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <h3 className="text-sm font-semibold text-slate-200">Key Catalysts</h3>
              </div>
              <ul className="space-y-1.5">
                {ai.key_catalysts.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="text-green-400 mt-0.5">•</span>{c}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="bg-panel border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-yellow-400" />
              <h3 className="text-sm font-semibold text-slate-200">When to Buy (If Not Now)</h3>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{ai.when_to_buy}</p>
            {ai.price_target_6m && (
              <div className="mt-3 bg-surface rounded-lg p-2.5">
                <p className="text-xs text-slate-400 mb-0.5">6-Month Price Target</p>
                <p className="text-sm text-slate-200">{ai.price_target_6m}</p>
              </div>
            )}
          </div>

          <div className="bg-panel border border-border rounded-xl p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Technical Summary (AI)</h3>
            <p className="text-sm text-slate-300 leading-relaxed">{ai.technical_summary}</p>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-4 mb-2">Fundamental Summary (AI)</h3>
            <p className="text-sm text-slate-300 leading-relaxed">{ai.fundamental_summary}</p>
          </div>
        </>
      )}

      {/* Fibonacci */}
      <FibTable levels={technical.fib_levels} currentPrice={current_price} />

      {/* 52W range */}
      <div className="bg-panel border border-border rounded-xl p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">52-Week Range</h3>
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>${stock.week52_low.toFixed(2)}</span>
          <span>${stock.week52_high.toFixed(2)}</span>
        </div>
        <div className="relative w-full bg-surface rounded-full h-2">
          <div
            className="absolute top-0 h-2 rounded-full bg-gradient-to-r from-red-500 to-green-500"
            style={{ width: '100%', opacity: 0.3 }}
          />
          <div
            className="absolute top-0 w-2.5 h-2.5 bg-white border-2 border-accent rounded-full -translate-y-0.5"
            style={{ left: `calc(${((current_price - stock.week52_low) / (stock.week52_high - stock.week52_low)) * 100}% - 5px)` }}
          />
        </div>
        <p className="text-xs text-slate-400 mt-2 text-center">
          Current: ${current_price.toFixed(2)} ({(((current_price - stock.week52_low) / (stock.week52_high - stock.week52_low)) * 100).toFixed(0)}% of range)
        </p>
      </div>

      <p className="text-xs text-slate-600 text-center pb-2">
        This analysis is for informational purposes only and does not constitute financial advice. Past performance does not guarantee future results.
      </p>
    </div>
  )
}
