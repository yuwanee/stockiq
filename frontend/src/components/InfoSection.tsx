import type { StockResult, AnalystCounts } from '../types/stock'
import { Globe, MapPin, Users, ExternalLink, Newspaper, TrendingUp, TrendingDown, Minus } from 'lucide-react'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number | null | undefined, cur = ''): string {
  if (n == null) return 'N/A'
  const pre = cur ? `${cur} ` : ''
  const abs = Math.abs(n)
  if (abs >= 1e12) return `${pre}${(n / 1e12).toFixed(2)}T`
  if (abs >= 1e9)  return `${pre}${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6)  return `${pre}${(n / 1e6).toFixed(2)}M`
  return `${pre}${n.toLocaleString()}`
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return 'N/A'
  return `${(n * 100).toFixed(2)}%`
}

function timeAgo(ts: number): string {
  const diff = Date.now() / 1000 - ts
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(ts * 1000).toLocaleDateString()
}

function sectorLabel(raw: string): string {
  return raw.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── 52-week range bar ────────────────────────────────────────────────────────

function WeekRange({ low, high, current }: { low: number; high: number; current: number }) {
  const pct = Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100))
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500 mb-1.5">
        <span>${low.toFixed(2)}</span>
        <span className="text-slate-400 font-medium">52-Week Range</span>
        <span>${high.toFixed(2)}</span>
      </div>
      <div className="relative h-2 bg-surface rounded-full overflow-visible">
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-500/30 via-yellow-500/20 to-green-500/30" />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow border-2 border-accent z-10"
          style={{ left: `calc(${pct}% - 7px)` }}
        />
      </div>
      <div className="text-center text-xs text-slate-500 mt-1.5">
        Current <span className="text-white font-medium">${current.toFixed(2)}</span>
        {' '}· {pct.toFixed(1)}% from low
      </div>
    </div>
  )
}

// ── Analyst consensus ────────────────────────────────────────────────────────

function AnalystBar({ counts, total, label, color }: { counts: number; total: number; label: string; color: string }) {
  const pct = total > 0 ? (counts / total) * 100 : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 w-20 flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-300 w-6 text-right">{counts}</span>
    </div>
  )
}

function AnalystConsensus({ counts, mean, targetLow, targetMean, targetHigh, currentPrice, analystCount, recKey }:
  { counts: AnalystCounts | null; mean: number | null; targetLow: number | null; targetMean: number | null; targetHigh: number | null; currentPrice: number; analystCount: number | null; recKey: string }) {
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0
  const upside = targetMean ? ((targetMean / currentPrice) - 1) * 100 : null

  const recColors: Record<string, string> = {
    'strong_buy': 'text-green-400', 'buy': 'text-emerald-400',
    'hold': 'text-yellow-400', 'sell': 'text-orange-400', 'strong_sell': 'text-red-400',
  }
  const recColor = recColors[recKey] || 'text-slate-300'

  return (
    <div className="bg-panel border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Analyst Consensus</h3>
        {analystCount && <span className="text-xs text-slate-500">{analystCount} analysts</span>}
      </div>

      <div className="flex items-center gap-3">
        <span className={`text-lg font-bold capitalize ${recColor}`}>
          {recKey.replace('_', ' ') || 'N/A'}
        </span>
        {mean && (
          <span className="text-xs text-slate-500 bg-surface px-2 py-1 rounded">
            {mean.toFixed(1)} / 5.0
          </span>
        )}
      </div>

      {counts && total > 0 && (
        <div className="space-y-1.5">
          <AnalystBar counts={counts.strongBuy} total={total} label="Strong Buy" color="bg-green-500" />
          <AnalystBar counts={counts.buy} total={total} label="Buy" color="bg-emerald-500" />
          <AnalystBar counts={counts.hold} total={total} label="Hold" color="bg-yellow-500" />
          <AnalystBar counts={counts.sell} total={total} label="Sell" color="bg-orange-500" />
          <AnalystBar counts={counts.strongSell} total={total} label="Strong Sell" color="bg-red-500" />
        </div>
      )}

      {(targetLow || targetMean || targetHigh) && (
        <div className="border-t border-border pt-3 grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Low Target', val: targetLow },
            { label: 'Mean Target', val: targetMean },
            { label: 'High Target', val: targetHigh },
          ].map(({ label, val }) => (
            <div key={label} className="bg-surface rounded-lg p-2">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-sm font-bold text-white">{val ? `$${val.toFixed(2)}` : 'N/A'}</p>
            </div>
          ))}
        </div>
      )}

      {upside !== null && (
        <div className={`flex items-center gap-1.5 text-sm font-semibold ${upside >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {upside >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          {upside >= 0 ? '+' : ''}{upside.toFixed(1)}% analyst upside from current price
        </div>
      )}
    </div>
  )
}

// ── Horizontal bar ───────────────────────────────────────────────────────────

function HBar({ label, pct, color = 'bg-accent' }: { label: string; pct: number; color?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-300 w-40 flex-shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct * 100)}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-12 text-right">{(pct * 100).toFixed(1)}%</span>
    </div>
  )
}

// ── STOCK Info ────────────────────────────────────────────────────────────────

function StockInfo({ stock }: { stock: StockResult }) {
  const info = stock.company_info
  const fund = stock.fundamental

  return (
    <div className="space-y-5">
      {/* Overview card */}
      <div className="bg-panel border border-border rounded-xl p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">{stock.company_name}</h2>
            <p className="text-sm text-slate-400">{stock.sector} · {stock.industry}</p>
            {info?.exchange && <p className="text-xs text-slate-500 mt-0.5">Exchange: {info.exchange}</p>}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-bold text-white">${stock.current_price.toFixed(2)}</p>
            <p className="text-xs text-slate-500">{stock.currency}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {stock.market_cap && (
            <div className="bg-surface rounded-lg p-3">
              <p className="text-xs text-slate-500">Market Cap</p>
              <p className="text-sm font-semibold text-white">{fmtNum(stock.market_cap, stock.currency)}</p>
            </div>
          )}
          {info?.employees && (
            <div className="bg-surface rounded-lg p-3">
              <p className="text-xs text-slate-500 flex items-center gap-1"><Users className="w-3 h-3" />Employees</p>
              <p className="text-sm font-semibold text-white">{info.employees.toLocaleString()}</p>
            </div>
          )}
          {fund.dividend_yield && (
            <div className="bg-surface rounded-lg p-3">
              <p className="text-xs text-slate-500">Dividend Yield</p>
              <p className="text-sm font-semibold text-green-400">{fmtPct(fund.dividend_yield)}</p>
            </div>
          )}
          {fund.eps && (
            <div className="bg-surface rounded-lg p-3">
              <p className="text-xs text-slate-500">EPS (TTM)</p>
              <p className="text-sm font-semibold text-white">${fund.eps.toFixed(2)}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-slate-400">
          {info?.website && (
            <a href={info.website} target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-1 hover:text-accent transition-colors">
              <Globe className="w-3.5 h-3.5" />
              {info.website.replace(/^https?:\/\//, '')}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {(info?.city || info?.country) && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {[info.city, info.state, info.country].filter(Boolean).join(', ')}
            </span>
          )}
        </div>
      </div>

      {/* Business description */}
      {info?.full_description && (
        <div className="bg-panel border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">About</h3>
          <p className="text-sm text-slate-400 leading-relaxed">{info.full_description}</p>
        </div>
      )}

      {/* 52-week range */}
      <div className="bg-panel border border-border rounded-xl p-5">
        <WeekRange low={stock.week52_low} high={stock.week52_high} current={stock.current_price} />
      </div>

      {/* Analyst consensus */}
      <AnalystConsensus
        counts={info?.analyst_counts ?? null}
        mean={fund.recommendation_mean}
        targetLow={fund.target_low}
        targetMean={fund.target_mean}
        targetHigh={fund.target_high}
        currentPrice={stock.current_price}
        analystCount={fund.analyst_count}
        recKey={fund.analyst_recommendation}
      />

      {/* News */}
      {fund.news && fund.news.length > 0 && (
        <div className="bg-panel border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-1.5">
            <Newspaper className="w-4 h-4" /> Recent News
          </h3>
          <div className="divide-y divide-border">
            {fund.news.map((item, i) => (
              <a
                key={i}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 py-3 group hover:bg-surface/50 -mx-5 px-5 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 group-hover:text-accent transition-colors leading-snug line-clamp-2">
                    {item.title}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {item.publisher} · {timeAgo(item.publishedAt)}
                  </p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-slate-600 group-hover:text-accent flex-shrink-0 mt-0.5 transition-colors" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── ETF Info ──────────────────────────────────────────────────────────────────

function ETFInfo({ stock }: { stock: StockResult }) {
  const etf = stock.etf_data!
  const perf = etf.performance_metrics
  const holdings = etf.holdings

  const sectorColors = [
    'bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-yellow-500',
    'bg-orange-500', 'bg-pink-500', 'bg-teal-500', 'bg-red-500',
    'bg-indigo-500', 'bg-cyan-500',
  ]

  const sectors = Object.entries(holdings.sector_weightings || {})
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)

  const assetClasses = Object.entries(holdings.asset_classes || {})
    .filter(([, v]) => v != null && v > 0)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))

  const returns = [
    { label: 'YTD', val: etf.ytd_return },
    { label: '1Y CAGR', val: perf?.return_1y },
    { label: '3Y Avg', val: etf.return_3y },
    { label: '5Y Avg', val: etf.return_5y },
  ].filter(r => r.val != null)

  return (
    <div className="space-y-5">
      {/* ETF overview */}
      <div className="bg-panel border border-border rounded-xl p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">{stock.company_name}</h2>
            <p className="text-sm text-slate-400">{etf.fund_family} · {etf.category}</p>
          </div>
          <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded-full border border-purple-500/30 font-semibold flex-shrink-0">ETF</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {etf.aum && (
            <div className="bg-surface rounded-lg p-3">
              <p className="text-xs text-slate-500">AUM</p>
              <p className="text-sm font-semibold text-white">{fmtNum(etf.aum)}</p>
            </div>
          )}
          {etf.expense_ratio != null && (
            <div className="bg-surface rounded-lg p-3">
              <p className="text-xs text-slate-500">Expense Ratio</p>
              <p className="text-sm font-semibold text-white">{(etf.expense_ratio * 100).toFixed(3)}%</p>
            </div>
          )}
          {etf.distribution_yield != null && (
            <div className="bg-surface rounded-lg p-3">
              <p className="text-xs text-slate-500">Distribution Yield</p>
              <p className="text-sm font-semibold text-green-400">{fmtPct(etf.distribution_yield)}</p>
            </div>
          )}
          {etf.nav_price != null && (
            <div className="bg-surface rounded-lg p-3">
              <p className="text-xs text-slate-500">NAV</p>
              <p className="text-sm font-semibold text-white">${etf.nav_price.toFixed(2)}</p>
            </div>
          )}
        </div>

        {etf.description && (
          <p className="text-sm text-slate-400 leading-relaxed mt-4">{etf.description}</p>
        )}
      </div>

      {/* Returns */}
      {returns.length > 0 && (
        <div className="bg-panel border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Performance Returns</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {returns.map(({ label, val }) => (
              <div key={label} className="bg-surface rounded-lg p-3 text-center">
                <p className="text-xs text-slate-500">{label}</p>
                <p className={`text-base font-bold ${(val ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {(val ?? 0) >= 0 ? '+' : ''}{((val ?? 0) * 100).toFixed(1)}%
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk metrics */}
      {perf && (
        <div className="bg-panel border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Risk Metrics</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Sharpe Ratio', val: perf.sharpe_ratio?.toFixed(2) },
              { label: 'Sortino Ratio', val: perf.sortino_ratio?.toFixed(2) },
              { label: 'Max Drawdown', val: perf.max_drawdown != null ? `${(perf.max_drawdown * 100).toFixed(1)}%` : null },
              { label: 'Annual Volatility', val: perf.annualized_volatility != null ? `${(perf.annualized_volatility * 100).toFixed(1)}%` : null },
              { label: 'Win Rate', val: perf.win_rate != null ? `${(perf.win_rate * 100).toFixed(1)}%` : null },
              { label: 'Calmar Ratio', val: perf.calmar_ratio?.toFixed(2) },
            ].filter(r => r.val != null).map(({ label, val }) => (
              <div key={label} className="bg-surface rounded-lg p-3">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-sm font-semibold text-white">{val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top holdings */}
      {holdings.top_holdings && holdings.top_holdings.length > 0 && (
        <div className="bg-panel border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Top Holdings</h3>
          <div className="space-y-2">
            {holdings.top_holdings.map((h, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-4">{i + 1}</span>
                <span className="text-xs font-semibold text-accent w-16 flex-shrink-0">{h.symbol}</span>
                <span className="text-xs text-slate-400 flex-1 truncate">{h.name}</span>
                <div className="w-24 h-1.5 bg-surface rounded-full overflow-hidden flex-shrink-0">
                  <div
                    className="h-full bg-accent rounded-full"
                    style={{ width: `${Math.min(100, h.weight * 100 / (holdings.top_holdings[0]?.weight || 1) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-slate-300 w-10 text-right flex-shrink-0">
                  {(h.weight * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sector allocation */}
      {sectors.length > 0 && (
        <div className="bg-panel border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Sector Allocation</h3>
          <div className="space-y-2">
            {sectors.map(([key, val], i) => (
              <HBar key={key} label={sectorLabel(key)} pct={val} color={sectorColors[i % sectorColors.length]} />
            ))}
          </div>
        </div>
      )}

      {/* Asset classes */}
      {assetClasses.length > 0 && (
        <div className="bg-panel border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Asset Class Breakdown</h3>
          <div className="flex flex-wrap gap-3">
            {assetClasses.map(([key, val]) => (
              <div key={key} className="bg-surface rounded-lg p-3 text-center min-w-[80px]">
                <p className="text-xs text-slate-500 capitalize">{key}</p>
                <p className="text-base font-bold text-white">{((val ?? 0) * 100).toFixed(1)}%</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 52-week range */}
      <div className="bg-panel border border-border rounded-xl p-5">
        <WeekRange low={stock.week52_low} high={stock.week52_high} current={stock.current_price} />
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function InfoSection({ stock }: { stock: StockResult }) {
  if (stock.is_etf && stock.etf_data) {
    return <ETFInfo stock={stock} />
  }
  return <StockInfo stock={stock} />
}
