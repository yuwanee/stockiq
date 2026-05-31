import type { ETFData, FundamentalData } from '../types/stock'

function pct(v: number | null | undefined, decimals = 2) {
  if (v == null || isNaN(v as number)) return 'N/A'
  return `${(v * 100).toFixed(decimals)}%`
}

function pctDirect(v: number | null | undefined, decimals = 1) {
  if (v == null || isNaN(v as number)) return 'N/A'
  return `${(v * 100).toFixed(decimals)}%`
}

function num(v: number | null | undefined, d = 2) {
  if (v == null || isNaN(v as number)) return 'N/A'
  return (v as number).toFixed(d)
}

function big(v: number | null | undefined) {
  if (v == null) return 'N/A'
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(2)}M`
  return `$${(v as number).toFixed(0)}`
}

function grade(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'A', color: 'text-green-400' }
  if (score >= 65) return { label: 'B', color: 'text-emerald-400' }
  if (score >= 50) return { label: 'C', color: 'text-yellow-400' }
  if (score >= 35) return { label: 'D', color: 'text-orange-400' }
  return { label: 'F', color: 'text-red-400' }
}

function MetricRow({ label, value, good, note }: { label: string; value: string; good?: boolean | null; note?: string }) {
  return (
    <div className="flex justify-between items-start py-1.5 border-b border-border/40 last:border-0">
      <div>
        <span className="text-xs text-slate-400">{label}</span>
        {note && <p className="text-xs text-slate-600 mt-0.5">{note}</p>}
      </div>
      <span className={`text-sm font-semibold ml-4 ${good === true ? 'text-green-400' : good === false ? 'text-red-400' : 'text-slate-200'}`}>
        {value}
      </span>
    </div>
  )
}

function Card({ title, children, badge }: { title: string; children: React.ReactNode; badge?: string }) {
  return (
    <div className="bg-panel border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</h3>
        {badge && <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full">{badge}</span>}
      </div>
      {children}
    </div>
  )
}

function ScoreMeter({ label, score }: { label: string; score: number }) {
  const g = grade(score)
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-400">{label}</span>
          <span className={`font-semibold ${g.color}`}>{score.toFixed(0)}/100</span>
        </div>
        <div className="w-full bg-surface rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full ${score >= 65 ? 'bg-green-500' : score >= 45 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
      <span className={`text-lg font-bold w-6 text-center ${g.color}`}>{g.label}</span>
    </div>
  )
}

function SectorBar({ name, weight }: { name: string; weight: number }) {
  const pctVal = weight > 1 ? weight : weight * 100
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-xs text-slate-400 w-32 truncate flex-shrink-0">{name}</span>
      <div className="flex-1 bg-surface rounded-full h-1.5">
        <div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.min(100, pctVal)}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-200 w-12 text-right">{pctVal.toFixed(1)}%</span>
    </div>
  )
}

function CaptureRatioBadge({ up, down }: { up: number; down: number }) {
  const ratio = down > 0 ? up / down : 1
  const good = ratio > 1
  return (
    <div className="bg-surface rounded-lg p-3 text-center">
      <p className="text-xs text-slate-400 mb-1">Capture Ratio</p>
      <p className={`text-xl font-bold ${good ? 'text-green-400' : 'text-red-400'}`}>{ratio.toFixed(2)}x</p>
      <p className="text-xs text-slate-500 mt-1">Up {up.toFixed(0)}% / Down {down.toFixed(0)}%</p>
      <p className="text-xs text-slate-500">{good ? 'Captures more upside' : 'More downside sensitivity'}</p>
    </div>
  )
}

function timeAgo(ts: number) {
  const diff = Date.now() / 1000 - ts
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

interface Props {
  etf: ETFData
  fundamental: FundamentalData
}

export default function ETFFundamentalSection({ etf, fundamental }: Props) {
  const p = etf.performance_metrics
  const b = etf.benchmark_comparison
  const h = etf.holdings
  const score = fundamental.fundamental_score

  const erPct = etf.expense_ratio ? etf.expense_ratio * 100 : null
  const erGood = erPct != null ? erPct < 0.5 : null

  return (
    <div className="space-y-4">
      {/* Score Banner */}
      <div className="bg-panel border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-slate-400 mb-0.5">ETF Quality Score</p>
            <p className="text-3xl font-bold text-white">{score.toFixed(0)}<span className="text-lg text-slate-400">/100</span></p>
          </div>
          <div className="text-right">
            {etf.category && <p className="text-sm font-medium text-slate-200">{etf.category}</p>}
            {etf.fund_family && <p className="text-xs text-slate-400">{etf.fund_family}</p>}
          </div>
        </div>
        <div className="space-y-2">
          <ScoreMeter label="Overall ETF Quality" score={score} />
        </div>
      </div>

      {/* ETF Overview */}
      <Card title="ETF Overview">
        <MetricRow label="Expense Ratio (Annual Fee)"
          value={erPct != null ? `${erPct.toFixed(3)}%` : 'N/A'}
          good={erGood}
          note={erPct != null ? (erPct < 0.2 ? 'Very low cost — excellent' : erPct < 0.5 ? 'Low cost — good' : erPct < 1 ? 'Moderate cost' : 'High cost — check alternatives') : undefined}
        />
        <MetricRow label="Assets Under Management"
          value={big(etf.aum)}
          good={etf.aum != null ? etf.aum > 1e9 : null}
          note={etf.aum != null ? (etf.aum > 10e9 ? 'Large & liquid' : etf.aum > 1e9 ? 'Liquid' : 'Smaller fund — check liquidity') : undefined}
        />
        <MetricRow label="Distribution Yield"
          value={etf.distribution_yield != null ? pct(etf.distribution_yield) : 'N/A'}
        />
        {etf.nav_price != null && (
          <MetricRow label="NAV Price" value={`$${etf.nav_price.toFixed(2)}`} />
        )}
      </Card>

      {/* Performance */}
      <Card title="Risk-Adjusted Performance (1 Year)" badge="Key Metrics">
        <div className="grid grid-cols-2 gap-3 mb-3">
          {[
            { label: 'Sharpe Ratio', v: num(p.sharpe_ratio, 2), good: p.sharpe_ratio > 1, note: '> 1.0 is good, > 1.5 excellent' },
            { label: 'Sortino Ratio', v: num(p.sortino_ratio, 2), good: p.sortino_ratio > 1, note: 'Downside risk-adjusted' },
            { label: 'Calmar Ratio', v: num(p.calmar_ratio, 2), good: p.calmar_ratio > 1, note: 'Return / Max Drawdown' },
            { label: 'Info Ratio', v: num(b.information_ratio, 2), good: b.information_ratio > 0.5, note: 'Alpha / Tracking error' },
          ].map(m => (
            <div key={m.label} className="bg-surface rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-0.5">{m.label}</p>
              <p className={`text-xl font-bold ${m.good ? 'text-green-400' : 'text-red-400'}`}>{m.v}</p>
              {m.note && <p className="text-xs text-slate-500 mt-0.5">{m.note}</p>}
            </div>
          ))}
        </div>
        <MetricRow label="1-Year CAGR"      value={pct(p.return_1y)}         good={p.return_1y > 0.05} />
        <MetricRow label="Max Drawdown"      value={pct(p.max_drawdown)}      good={Math.abs(p.max_drawdown) < 0.2} />
        <MetricRow label="Annualized Volatility" value={pct(p.annualized_volatility)} good={p.annualized_volatility < 0.20} />
        <MetricRow label="Win Rate (daily)"  value={pctDirect(p.win_rate)}    good={p.win_rate > 0.52} />
        <MetricRow label="Profit Factor"     value={num(p.profit_factor, 2)}  good={p.profit_factor > 1.5} note="Avg win / Avg loss" />
        <MetricRow label="VaR 95% (daily)"  value={pct(p.var_95)}            />
        <MetricRow label="CVaR 95% (daily)" value={pct(p.cvar_95)}           note="Expected loss in worst 5% of days" />
        {p.total_months > 0 && (
          <MetricRow label="Positive Months"
            value={`${p.positive_months}/${p.total_months} (${Math.round(p.positive_months/p.total_months*100)}%)`}
            good={p.positive_months/p.total_months > 0.58}
          />
        )}
      </Card>

      {/* Historical Returns */}
      <Card title="Historical Returns">
        <MetricRow label="YTD Return"      value={pct(etf.ytd_return)}   good={etf.ytd_return != null ? etf.ytd_return > 0 : null} />
        <MetricRow label="3-Year Average"  value={pct(etf.return_3y)}    good={etf.return_3y != null ? etf.return_3y > 0.07 : null} />
        <MetricRow label="5-Year Average"  value={pct(etf.return_5y)}    good={etf.return_5y != null ? etf.return_5y > 0.07 : null} />
        <MetricRow label="Skewness"        value={num(p.skewness, 3)}    good={p.skewness > 0} note="Positive skew preferred (more upside outliers)" />
        <MetricRow label="Kurtosis"        value={num(p.kurtosis, 3)}    note="High kurtosis = fat tails (more extreme moves)" />
      </Card>

      {/* Benchmark Comparison */}
      {Object.keys(b).length > 0 && (
        <Card title={`vs ${b.benchmark || 'SPY'} Benchmark`} badge="Alpha & Beta">
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="bg-surface rounded-lg p-3 text-center">
              <p className="text-xs text-slate-400 mb-1">Beta</p>
              <p className={`text-xl font-bold ${Math.abs(b.beta - 1) < 0.2 ? 'text-slate-200' : b.beta < 1 ? 'text-green-400' : 'text-yellow-400'}`}>{b.beta.toFixed(2)}</p>
              <p className="text-xs text-slate-500 mt-1">{b.beta < 0.8 ? 'Defensive' : b.beta <= 1.2 ? 'Market-like' : 'Aggressive'}</p>
            </div>
            <div className="bg-surface rounded-lg p-3 text-center">
              <p className="text-xs text-slate-400 mb-1">Alpha (Ann.)</p>
              <p className={`text-xl font-bold ${b.alpha_annualized > 0 ? 'text-green-400' : 'text-red-400'}`}>{(b.alpha_annualized * 100).toFixed(2)}%</p>
              <p className="text-xs text-slate-500 mt-1">{b.alpha_annualized > 0 ? 'Outperforming' : 'Underperforming'}</p>
            </div>
            <CaptureRatioBadge up={b.up_capture} down={b.down_capture} />
          </div>
          <MetricRow label="Correlation"      value={b.correlation.toFixed(3)}       good={null} note="1.0 = moves perfectly with benchmark" />
          <MetricRow label="R-Squared"        value={b.r_squared.toFixed(3)}         good={null} note="> 0.95 = very closely tracks benchmark" />
          <MetricRow label="Tracking Error"   value={pct(b.tracking_error)}          good={b.tracking_error < 0.05} note="Annualized deviation from benchmark" />
          <MetricRow label="ETF Return 1Y"    value={pct(b.etf_return_1y)}           good={b.etf_return_1y > 0} />
          <MetricRow label="Benchmark Return" value={pct(b.benchmark_return_1y)}     good={null} />
          <MetricRow label="Relative Perf."   value={pct(b.relative_performance)}    good={b.relative_performance > 0}
            note={`ETF ${b.relative_performance >= 0 ? 'outperformed' : 'underperformed'} by ${Math.abs(b.relative_performance * 100).toFixed(2)}%`}
          />
        </Card>
      )}

      {/* Holdings */}
      {h.top_holdings.length > 0 && (
        <Card title="Top Holdings">
          <div className="space-y-2">
            {h.top_holdings.map((holding, i) => {
              const wt = holding.weight > 1 ? holding.weight : holding.weight * 100
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-4 text-right">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-200 truncate">{holding.name || holding.symbol}</span>
                      <span className="text-sm font-semibold text-accent ml-2 flex-shrink-0">{wt.toFixed(2)}%</span>
                    </div>
                    <div className="w-full bg-surface rounded-full h-1 mt-1">
                      <div className="h-1 rounded-full bg-accent/60" style={{ width: `${Math.min(100, wt * 2)}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Sector Weights */}
      {Object.keys(h.sector_weightings).length > 0 && (
        <Card title="Sector Allocation">
          <div className="space-y-0.5">
            {Object.entries(h.sector_weightings)
              .sort((a, b) => (b[1] as number) - (a[1] as number))
              .map(([sector, weight]) => (
                <SectorBar key={sector} name={sector} weight={weight as number} />
              ))}
          </div>
        </Card>
      )}

      {/* Asset Classes */}
      {Object.keys(h.asset_classes).length > 0 && (
        <Card title="Asset Class Breakdown">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(h.asset_classes).map(([cls, weight]) => {
              const wPct = (weight as number) > 1 ? weight as number : (weight as number) * 100
              return (
                <div key={cls} className="bg-surface rounded-lg p-2.5">
                  <p className="text-xs text-slate-400 mb-0.5">{cls}</p>
                  <p className="text-base font-bold text-slate-200">{wPct.toFixed(1)}%</p>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Equity Holdings Metrics (P/E etc.) */}
      {h.equity_holdings && Object.keys(h.equity_holdings).length > 0 && (
        <Card title="Portfolio Equity Metrics" badge="Weighted Avg.">
          {Object.entries(h.equity_holdings).slice(0, 8).map(([k, v]) => (
            <MetricRow key={k} label={k} value={typeof v === 'number' ? v.toFixed(2) : String(v)} />
          ))}
        </Card>
      )}

      {/* Description */}
      {etf.description && (
        <Card title="About This ETF">
          <p className="text-sm text-slate-300 leading-relaxed">{etf.description}</p>
        </Card>
      )}

      {/* News */}
      {fundamental.news.length > 0 && (
        <Card title="Recent News">
          <div className="space-y-3">
            {fundamental.news.map((n, i) => (
              <a key={i} href={n.link} target="_blank" rel="noopener noreferrer"
                className="block hover:bg-surface rounded-lg p-2 -mx-2 transition-colors group">
                <p className="text-sm text-slate-200 group-hover:text-white leading-snug">{n.title}</p>
                <p className="text-xs text-slate-500 mt-1">{n.publisher} · {timeAgo(n.publishedAt)}</p>
              </a>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
