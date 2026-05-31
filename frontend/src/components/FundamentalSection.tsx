import type { FundamentalData, NewsItem, ETFData } from '../types/stock'
import ETFFundamentalSection from './ETFFundamentalSection'

function pct(v: number | null) {
  if (v === null || v === undefined) return 'N/A'
  return `${(v * 100).toFixed(1)}%`
}

function num(v: number | null, decimals = 2) {
  if (v === null || v === undefined || isNaN(v)) return 'N/A'
  return v.toFixed(decimals)
}

function big(v: number | null) {
  if (v === null || v === undefined) return 'N/A'
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  return `$${v.toFixed(0)}`
}

function score_color(v: number) {
  if (v >= 70) return 'text-green-400'
  if (v >= 50) return 'text-yellow-400'
  return 'text-red-400'
}

function MetricCard({ title, items }: { title: string; items: { label: string; value: string; good?: boolean | null }[] }) {
  return (
    <div className="bg-panel border border-border rounded-xl p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">{title}</h3>
      <div className="space-y-2">
        {items.map(({ label, value, good }) => (
          <div key={label} className="flex justify-between items-center">
            <span className="text-xs text-slate-400">{label}</span>
            <span className={`text-sm font-semibold ${good === true ? 'text-green-400' : good === false ? 'text-red-400' : 'text-slate-200'}`}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RecBar({ mean }: { mean: number | null }) {
  if (mean === null || mean === undefined) return <span className="text-slate-400 text-sm">N/A</span>
  const labels = ['', 'Strong Buy', 'Buy', 'Hold', 'Sell', 'Strong Sell']
  const colors = ['', 'text-green-400', 'text-green-300', 'text-yellow-400', 'text-red-300', 'text-red-400']
  const idx = Math.round(mean)
  return (
    <span className={`text-sm font-semibold ${colors[idx] || 'text-slate-200'}`}>
      {labels[idx] || mean.toFixed(1)}
    </span>
  )
}

function timeAgo(ts: number) {
  const diff = Date.now() / 1000 - ts
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function FundamentalSection({
  fundamental, etfData, isEtf,
}: { fundamental: FundamentalData; etfData?: ETFData | null; isEtf?: boolean }) {
  if (isEtf && etfData) {
    return <ETFFundamentalSection etf={etfData} fundamental={fundamental} />
  }
  const f = fundamental

  return (
    <div className="space-y-4">
      {/* Score banner */}
      <div className="bg-panel border border-border rounded-xl p-4 flex items-center gap-4">
        <div className="flex-1">
          <p className="text-xs text-slate-400 mb-1">Fundamental Score</p>
          <div className="w-full bg-surface rounded-full h-2">
            <div className={`h-2 rounded-full ${f.fundamental_score >= 70 ? 'bg-green-500' : f.fundamental_score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${f.fundamental_score}%` }} />
          </div>
        </div>
        <span className={`text-2xl font-bold ${score_color(f.fundamental_score)}`}>{f.fundamental_score}/100</span>
      </div>

      {/* Valuation */}
      <MetricCard title="Valuation" items={[
        { label: 'P/E (TTM)', value: num(f.pe_ratio), good: f.pe_ratio ? f.pe_ratio < 25 : null },
        { label: 'Forward P/E', value: num(f.forward_pe), good: f.forward_pe ? f.forward_pe < 25 : null },
        { label: 'PEG Ratio', value: num(f.peg_ratio), good: f.peg_ratio ? f.peg_ratio < 1.5 : null },
        { label: 'Price/Book', value: num(f.pb_ratio), good: f.pb_ratio ? f.pb_ratio < 3 : null },
        { label: 'Price/Sales', value: num(f.ps_ratio), good: f.ps_ratio ? f.ps_ratio < 5 : null },
        { label: 'EV/EBITDA', value: num(f.ev_ebitda), good: f.ev_ebitda ? f.ev_ebitda < 15 : null },
      ]} />

      {/* Growth */}
      <MetricCard title="Growth" items={[
        { label: 'Revenue Growth', value: pct(f.revenue_growth), good: f.revenue_growth ? f.revenue_growth > 0.05 : null },
        { label: 'Earnings Growth', value: pct(f.earnings_growth), good: f.earnings_growth ? f.earnings_growth > 0.05 : null },
        { label: 'EPS (TTM)', value: f.eps !== null ? `$${num(f.eps)}` : 'N/A' },
        { label: 'Forward EPS', value: f.forward_eps !== null ? `$${num(f.forward_eps)}` : 'N/A', good: f.forward_eps && f.eps ? f.forward_eps > f.eps : null },
      ]} />

      {/* Profitability */}
      <MetricCard title="Profitability" items={[
        { label: 'Gross Margin', value: pct(f.gross_margins), good: f.gross_margins ? f.gross_margins > 0.3 : null },
        { label: 'Operating Margin', value: pct(f.operating_margins), good: f.operating_margins ? f.operating_margins > 0.1 : null },
        { label: 'Net Margin', value: pct(f.profit_margins), good: f.profit_margins ? f.profit_margins > 0.05 : null },
        { label: 'Return on Equity', value: pct(f.roe), good: f.roe ? f.roe > 0.1 : null },
        { label: 'Return on Assets', value: pct(f.roa), good: f.roa ? f.roa > 0.05 : null },
        { label: 'Free Cash Flow', value: big(f.free_cash_flow), good: f.free_cash_flow ? f.free_cash_flow > 0 : null },
      ]} />

      {/* Financial Health */}
      <MetricCard title="Financial Health" items={[
        { label: 'Debt/Equity', value: f.debt_to_equity !== null ? num(f.debt_to_equity, 1) : 'N/A', good: f.debt_to_equity ? f.debt_to_equity < 100 : null },
        { label: 'Current Ratio', value: num(f.current_ratio, 2), good: f.current_ratio ? f.current_ratio > 1.5 : null },
        { label: 'Quick Ratio', value: num(f.quick_ratio, 2), good: f.quick_ratio ? f.quick_ratio > 1 : null },
        { label: 'Revenue', value: big(f.revenue) },
        { label: 'Net Income', value: big(f.net_income), good: f.net_income ? f.net_income > 0 : null },
      ]} />

      {/* Dividend */}
      {(f.dividend_yield !== null) && (
        <MetricCard title="Dividend" items={[
          { label: 'Dividend Yield', value: pct(f.dividend_yield), good: f.dividend_yield ? f.dividend_yield > 0 : null },
          { label: 'Book Value/Share', value: f.book_value !== null ? `$${num(f.book_value)}` : 'N/A' },
        ]} />
      )}

      {/* Analyst */}
      <div className="bg-panel border border-border rounded-xl p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Analyst Consensus ({f.analyst_count || 0} analysts)</h3>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-slate-400">Recommendation</span>
          <RecBar mean={f.recommendation_mean} />
        </div>
        {f.target_mean !== null && (
          <div className="space-y-1.5">
            {[
              { label: 'Target Low', v: f.target_low },
              { label: 'Target Mean', v: f.target_mean },
              { label: 'Target High', v: f.target_high },
            ].map(({ label, v }) => (
              <div key={label} className="flex justify-between">
                <span className="text-xs text-slate-400">{label}</span>
                <span className="text-sm font-semibold text-slate-200">{v ? `$${v.toFixed(2)}` : 'N/A'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Description */}
      {f.description && (
        <div className="bg-panel border border-border rounded-xl p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">About</h3>
          <p className="text-sm text-slate-300 leading-relaxed">{f.description}</p>
        </div>
      )}

      {/* News */}
      {f.news.length > 0 && (
        <div className="bg-panel border border-border rounded-xl p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Recent News</h3>
          <div className="space-y-3">
            {f.news.map((n: NewsItem, i: number) => (
              <a key={i} href={n.link} target="_blank" rel="noopener noreferrer"
                className="block hover:bg-surface rounded-lg p-2 -mx-2 transition-colors group">
                <p className="text-sm text-slate-200 group-hover:text-white leading-snug">{n.title}</p>
                <p className="text-xs text-slate-500 mt-1">{n.publisher} · {timeAgo(n.publishedAt)}</p>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
