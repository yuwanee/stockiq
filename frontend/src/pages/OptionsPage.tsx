import { useState } from 'react'
import { TrendingUp, TrendingDown, Zap, AlertTriangle, Clock, RefreshCw, Loader2, DollarSign, Target } from 'lucide-react'
import axios from 'axios'
import AppNav, { type AppView } from '../components/AppNav'

interface OptionPick {
  rank: number
  symbol: string
  direction: 'CALL' | 'PUT'
  stock_price: number
  strike: number
  expiry_date: string
  dte: number
  contract_symbol: string
  bid_price: number
  ask_price: number
  mid_price: number
  entry_note: string
  delta: number
  theta: number
  implied_volatility: number | null
  spread_pct: number
  in_the_money: boolean
  option_volume: number
  open_interest: number
  contracts: number
  total_cost: number
  allocation: number
  profit_target_price: number
  stop_loss_price: number
  profit_target_pnl: number
  stop_loss_pnl: number
  momentum_score: number
  rsi: number
  price_vs_sma20: string
  ai_analysis: string | null
  ai_risk: string | null
  ai_entry_time: string | null
  price_is_last: boolean
}

interface ScanResult {
  date: string
  scan_time_utc: string
  market_open: boolean
  capital: number
  picks: OptionPick[]
  strategy: {
    type: string
    entry_window: string
    profit_target: string
    stop_loss: string
    order_type: string
    note: string
  }
  error?: string
}

interface Props {
  onNavigate: (v: AppView) => void
}

function DirectionBadge({ direction }: { direction: 'CALL' | 'PUT' }) {
  if (direction === 'CALL') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-green-500/20 text-green-400 border border-green-500/30">
        <TrendingUp className="w-3 h-3" /> CALL
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30">
      <TrendingDown className="w-3 h-3" /> PUT
    </span>
  )
}

function StatBox({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: 'green' | 'red' | null }) {
  const valueColor = highlight === 'green' ? 'text-green-400' : highlight === 'red' ? 'text-red-400' : 'text-slate-200'
  return (
    <div className="bg-surface rounded-lg p-3">
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className={`text-base font-bold ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function PickCard({ pick }: { pick: OptionPick }) {
  const [expanded, setExpanded] = useState(false)
  const rrRatio = pick.profit_target_pnl / Math.abs(pick.stop_loss_pnl)

  return (
    <div className="bg-panel border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-accent">{pick.symbol.slice(0, 4)}</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-white text-lg">{pick.symbol}</span>
                <DirectionBadge direction={pick.direction} />
                {pick.in_the_money && (
                  <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded border border-accent/30">ITM</span>
                )}
              {pick.price_is_last && (
                  <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded border border-yellow-500/30">Last Close</span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                ${pick.strike} {pick.direction} · Exp {pick.expiry_date} ({pick.dte}d)
              </p>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-slate-400">Stock</p>
            <p className="text-lg font-bold text-white">${pick.stock_price.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Key numbers grid */}
      <div className="p-4 grid grid-cols-3 sm:grid-cols-6 gap-2">
        <StatBox label="Ask" value={`$${pick.ask_price.toFixed(2)}`} sub="per contract" />
        <StatBox label="Mid" value={`$${pick.mid_price.toFixed(2)}`} />
        <StatBox label="Contracts" value={String(pick.contracts)} sub={`$${pick.total_cost.toFixed(0)} total`} />
        <StatBox label="Delta" value={pick.delta.toFixed(3)} sub={pick.direction === 'CALL' ? 'call' : 'put'} />
        <StatBox label="IV" value={pick.implied_volatility != null ? `${pick.implied_volatility.toFixed(0)}%` : 'N/A'} />
        <StatBox label="Spread" value={`${pick.spread_pct.toFixed(1)}%`} highlight={pick.spread_pct > 10 ? 'red' : 'green'} />
      </div>

      {/* Bracket orders */}
      <div className="px-4 pb-4 grid grid-cols-2 gap-3">
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Target className="w-3.5 h-3.5 text-green-400" />
            <p className="text-xs font-semibold text-green-400">Profit Target (+15%)</p>
          </div>
          <p className="text-base font-bold text-green-400">${pick.profit_target_price.toFixed(2)}</p>
          <p className="text-xs text-green-500">+${pick.profit_target_pnl.toFixed(0)} on {pick.contracts} contract{pick.contracts > 1 ? 's' : ''}</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <p className="text-xs font-semibold text-red-400">Stop Loss (−30%)</p>
          </div>
          <p className="text-base font-bold text-red-400">${pick.stop_loss_price.toFixed(2)}</p>
          <p className="text-xs text-red-500">${pick.stop_loss_pnl.toFixed(0)} on {pick.contracts} contract{pick.contracts > 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Liquidity & context row */}
      <div className="px-4 pb-3 flex flex-wrap gap-3 text-xs text-slate-400">
        <span>Vol: <span className="text-slate-200 font-medium">{pick.option_volume.toLocaleString()}</span></span>
        <span>OI: <span className="text-slate-200 font-medium">{pick.open_interest.toLocaleString()}</span></span>
        <span>RSI: <span className="text-slate-200 font-medium">{pick.rsi.toFixed(0)}</span></span>
        <span>vs SMA20: <span className={`font-medium ${pick.price_vs_sma20 === 'above' ? 'text-green-400' : 'text-red-400'}`}>{pick.price_vs_sma20}</span></span>
        <span>R/R: <span className="text-slate-200 font-medium">{rrRatio.toFixed(2)}x</span></span>
        <span>θ: <span className="text-slate-200 font-medium">${pick.theta.toFixed(4)}/day</span></span>
      </div>

      {/* Entry note */}
      <div className="px-4 pb-3">
        <p className="text-xs text-slate-400 bg-surface rounded-lg px-3 py-2">{pick.entry_note}</p>
      </div>

      {/* AI section toggle */}
      {(pick.ai_analysis || pick.ai_risk || pick.ai_entry_time) && (
        <div className="border-t border-border">
          <button
            onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-accent" />AI Analysis (Claude)</span>
            <span>{expanded ? '▲' : '▼'}</span>
          </button>
          {expanded && (
            <div className="px-4 pb-4 space-y-3">
              {pick.ai_analysis && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 mb-1">Trade Rationale</p>
                  <p className="text-sm text-slate-300 leading-relaxed">{pick.ai_analysis}</p>
                </div>
              )}
              {pick.ai_entry_time && (
                <div className="flex items-start gap-2">
                  <Clock className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-yellow-400 mb-0.5">Ideal Entry Time</p>
                    <p className="text-sm text-slate-300">{pick.ai_entry_time}</p>
                  </div>
                </div>
              )}
              {pick.ai_risk && (
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-red-400 mb-0.5">Key Risk</p>
                    <p className="text-sm text-slate-300">{pick.ai_risk}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function OptionsPage({ onNavigate }: Props) {
  const [capital, setCapital] = useState('1000')
  const [maxPicks, setMaxPicks] = useState(3)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState('')

  async function scan() {
    const cap = parseFloat(capital)
    if (!cap || cap < 200) { setError('Minimum capital is $200.'); return }
    setError('')
    setLoading(true)
    try {
      const { data } = await axios.post<ScanResult>('/api/options/scan', { capital: cap, max_picks: maxPicks })
      setResult(data)
      if (data.error) setError(data.error)
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message || 'Scan failed.')
    } finally {
      setLoading(false)
    }
  }

  async function refresh() {
    await axios.delete('/api/options/cache')
    scan()
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav active="options" onNavigate={onNavigate} />

      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 space-y-5">
        {/* Config card */}
        <div className="bg-panel border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Scan Parameters</h2>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs text-slate-400 mb-1.5">Available Capital ($)</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="number"
                  value={capital}
                  onChange={e => setCapital(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl pl-8 pr-3 py-2.5 text-white text-sm outline-none focus:border-accent transition-colors"
                  placeholder="1000"
                  min="200"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">Min $200</p>
            </div>
            <div className="min-w-[140px]">
              <label className="block text-xs text-slate-400 mb-1.5">Max Picks</label>
              <div className="flex gap-2">
                {[1, 2, 3].map(n => (
                  <button
                    key={n}
                    onClick={() => setMaxPicks(n)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                      maxPicks === n
                        ? 'bg-accent border-accent text-white'
                        : 'bg-surface border-border text-slate-400 hover:border-accent/50'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={scan}
              disabled={loading}
              className="flex items-center gap-2 bg-accent hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-6 rounded-xl transition-colors text-sm"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Scanning…</> : <><TrendingUp className="w-4 h-4" />Scan Now</>}
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </div>

        {/* Strategy info */}
        {result && result.strategy && (
          <div className="bg-panel border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Strategy: {result.strategy.type}</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{result.scan_time_utc}</span>
                <button onClick={refresh} disabled={loading} className="flex items-center gap-1 text-xs text-slate-400 hover:text-accent transition-colors">
                  <RefreshCw className="w-3 h-3" />Refresh
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div><p className="text-slate-500 mb-0.5">Entry Window</p><p className="text-slate-200">{result.strategy.entry_window}</p></div>
              <div><p className="text-slate-500 mb-0.5">Profit Target</p><p className="text-green-400 font-semibold">{result.strategy.profit_target}</p></div>
              <div><p className="text-slate-500 mb-0.5">Stop Loss</p><p className="text-red-400 font-semibold">{result.strategy.stop_loss}</p></div>
              <div><p className="text-slate-500 mb-0.5">Order Type</p><p className="text-slate-200">{result.strategy.order_type.split(':')[0]}</p></div>
            </div>
            <p className="mt-3 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
              ⚠️ {result.strategy.note}
            </p>
            {!result.market_open && (
              <p className="mt-2 text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
                🔒 Market is closed — prices shown are from the last trading session. Verify live quotes before placing orders.
              </p>
            )}
          </div>
        )}

        {/* Picks */}
        {result && result.picks.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-300">
              Top {result.picks.length} Pick{result.picks.length !== 1 ? 's' : ''} · Capital: ${result.capital.toLocaleString()}
            </h2>
            {result.picks.map(pick => <PickCard key={pick.contract_symbol || pick.symbol} pick={pick} />)}
          </div>
        )}

        {result && result.picks.length === 0 && !error && (
          <div className="bg-panel border border-border rounded-xl p-8 text-center">
            <TrendingUp className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No qualifying options found right now.</p>
            <p className="text-xs text-slate-500 mt-1">Markets may be closed, or no contracts meet the liquidity/moneyness filters.</p>
          </div>
        )}

        {!result && !loading && (
          <div className="bg-panel border border-border rounded-xl p-8 text-center">
            <TrendingUp className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-300 font-medium mb-1">Ready to scan</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Scans {'{'}45+{'}'} liquid US stocks &amp; ETFs for the best intraday/weekly options setups based on momentum, volume, and greeks.
            </p>
          </div>
        )}

        <p className="text-xs text-slate-600 text-center pb-2">
          Options trading involves significant risk. Not financial advice. Past performance does not guarantee future results.
        </p>
      </div>
    </div>
  )
}
