import { useState, KeyboardEvent } from 'react'
import { X, Search, Loader2 } from 'lucide-react'
import { analyzeStocks } from '../services/api'
import type { AnalysisResults } from '../types/stock'
import AppNav, { type AppView } from '../components/AppNav'

const MARKETS = [
  { code: 'US',      label: 'US Markets',               suffix: '',    flag: '🇺🇸', hint: 'AAPL, NVDA, SPY' },
  { code: 'SET',     label: 'Thailand (SET)',            suffix: '.BK', flag: '🇹🇭', hint: 'SCB, PTT, ADVANC' },
  { code: 'LSE',     label: 'UK (LSE)',                  suffix: '.L',  flag: '🇬🇧', hint: 'HSBA, BP, GSK' },
  { code: 'TSE',     label: 'Japan (TSE)',               suffix: '.T',  flag: '🇯🇵', hint: '7203, 6758, 9984' },
  { code: 'HKEX',   label: 'Hong Kong (HKEX)',          suffix: '.HK', flag: '🇭🇰', hint: '0700, 0005, 2318' },
  { code: 'SGX',    label: 'Singapore (SGX)',            suffix: '.SI', flag: '🇸🇬', hint: 'D05, U11, Z74' },
  { code: 'XETRA',  label: 'Germany (XETRA)',           suffix: '.DE', flag: '🇩🇪', hint: 'SAP, SIE, BMW' },
  { code: 'EPA',    label: 'France (Euronext)',          suffix: '.PA', flag: '🇫🇷', hint: 'BNP, AIR, MC' },
  { code: 'ASX',    label: 'Australia (ASX)',            suffix: '.AX', flag: '🇦🇺', hint: 'CBA, BHP, CSL' },
  { code: 'TSX',    label: 'Canada (TSX)',               suffix: '.TO', flag: '🇨🇦', hint: 'RY, TD, CNR' },
  { code: 'KRX',    label: 'South Korea (KRX)',          suffix: '.KS', flag: '🇰🇷', hint: '005930, 000660' },
  { code: 'NSE',    label: 'India (NSE)',                suffix: '.NS', flag: '🇮🇳', hint: 'RELIANCE, TCS' },
  { code: 'SSE',    label: 'China Shanghai (SSE)',       suffix: '.SS', flag: '🇨🇳', hint: '600519, 601398' },
  { code: 'SZSE',   label: 'China Shenzhen (SZSE)',      suffix: '.SZ', flag: '🇨🇳', hint: '000001, 300750' },
  { code: 'TWSE',   label: 'Taiwan (TWSE)',              suffix: '.TW', flag: '🇹🇼', hint: '2330, 2454' },
  { code: 'BOVESPA',label: 'Brazil (B3)',                suffix: '.SA', flag: '🇧🇷', hint: 'PETR4, VALE3' },
]

const US_EXAMPLES = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'GOOGL', 'SPY', 'QQQ', 'VTI', 'ARKK', 'GLD']

interface Props {
  onResults: (r: AnalysisResults) => void
  onNavigate: (v: AppView) => void
  serverReady?: boolean
}

export default function InputPage({ onResults, onNavigate, serverReady = true }: Props) {
  const [input, setInput] = useState('')
  const [symbols, setSymbols] = useState<string[]>([])
  const [market, setMarket] = useState(MARKETS[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')

  function applyMarket(raw: string): string {
    const s = raw.toUpperCase().trim()
    if (!market.suffix || s.includes('.')) return s
    return s + market.suffix
  }

  function addSymbol(raw: string) {
    const parts = raw.toUpperCase().split(/[\s,;]+/).filter(Boolean).map(applyMarket)
    setSymbols(prev => {
      const next = [...prev]
      for (const s of parts) if (s && !next.includes(s)) next.push(s)
      return next
    })
    setInput('')
  }

  function removeSymbol(s: string) {
    setSymbols(prev => prev.filter(x => x !== s))
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault()
      if (input.trim()) addSymbol(input.trim())
    } else if (e.key === 'Backspace' && !input && symbols.length) {
      setSymbols(prev => prev.slice(0, -1))
    }
  }

  async function analyze() {
    const all = [...symbols]
    if (input.trim()) {
      addSymbol(input.trim())
      all.push(...input.toUpperCase().split(/[\s,;]+/).filter(Boolean))
    }
    if (!all.length) { setError('Please enter at least one stock symbol.'); return }
    setError('')
    setLoading(true)
    setProgress('Fetching market data & calculating indicators…')
    try {
      const results = await analyzeStocks(all)
      onResults(results)
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e.message || ''
      setError(
        msg.includes('timeout') || msg.includes('ECONNABORTED')
          ? 'Request timed out. The server may be waking up — please try again in a moment.'
          : msg || 'Analysis failed. Is the backend running?'
      )
    } finally {
      setLoading(false)
      setProgress('')
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav active="stock" onNavigate={onNavigate} />

      <div
        className="flex-1 flex flex-col items-center justify-center px-4 py-12 relative"
        style={{ background: 'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(59,130,246,0.09) 0%, transparent 70%)' }}
      >
        {/* Page heading */}
        <div className="w-full max-w-2xl mb-6">
          <h1 className="text-2xl font-bold text-white">Stock & ETF Analysis</h1>
          <p className="text-sm text-slate-400 mt-1">
            Enter one or more tickers for a full technical &amp; fundamental breakdown with AI-powered insights.
          </p>
        </div>

        {/* Input Card */}
        <div className="w-full max-w-2xl bg-panel border border-border rounded-2xl p-6 shadow-2xl">
          {/* Market selector */}
          <div className="flex items-center gap-3 mb-4">
            <label className="text-sm font-medium text-slate-300 flex-shrink-0">Market</label>
            <select
              value={market.code}
              onChange={e => setMarket(MARKETS.find(m => m.code === e.target.value) ?? MARKETS[0])}
              disabled={loading}
              className="flex-1 bg-surface border border-border text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent transition-colors"
            >
              {MARKETS.map(m => (
                <option key={m.code} value={m.code}>{m.flag} {m.label}</option>
              ))}
            </select>
            {market.code !== 'US' && (
              <span className="text-xs text-accent bg-accent/10 border border-accent/30 px-2 py-1 rounded-lg flex-shrink-0">
                suffix: {market.suffix}
              </span>
            )}
          </div>

          <label className="block text-sm font-medium text-slate-300 mb-3">
            Stock Symbols
            {market.code !== 'US' && (
              <span className="ml-2 text-xs text-slate-500 font-normal">e.g. {market.hint}</span>
            )}
          </label>

          {/* Tag input */}
          <div
            className="min-h-[52px] flex flex-wrap gap-2 items-center bg-surface border border-border rounded-xl px-3 py-2 focus-within:border-accent transition-colors cursor-text"
            onClick={() => document.getElementById('symbol-input')?.focus()}
          >
            {symbols.map(s => (
              <span key={s} className="flex items-center gap-1 bg-accent/20 text-accent border border-accent/40 text-sm font-semibold rounded-lg px-2.5 py-1">
                {s}
                <button onClick={() => removeSymbol(s)} className="hover:text-white transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <input
              id="symbol-input"
              className="flex-1 min-w-[120px] bg-transparent outline-none text-white placeholder-slate-500 text-sm"
              placeholder={symbols.length ? 'Add more…' : 'AAPL, NVDA, TSLA…'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => { if (input.trim()) addSymbol(input.trim()) }}
              disabled={loading}
            />
          </div>

          <p className="text-xs text-slate-500 mt-2">
            Press <kbd className="bg-border px-1 py-0.5 rounded text-slate-300">Enter</kbd> or{' '}
            <kbd className="bg-border px-1 py-0.5 rounded text-slate-300">,</kbd> to add each symbol
          </p>

          {/* Quick picks — only shown for US market */}
          {market.code === 'US' && (
            <div className="mt-4">
              <p className="text-xs text-slate-500 mb-2">Quick picks:</p>
              <div className="flex flex-wrap gap-2">
                {US_EXAMPLES.map(s => (
                  <button
                    key={s}
                    onClick={() => setSymbols(prev => prev.includes(s) ? prev : [...prev, s])}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                      symbols.includes(s)
                        ? 'bg-accent/20 border-accent/40 text-accent'
                        : 'bg-surface border-border text-slate-400 hover:border-accent/50 hover:text-slate-200'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          {progress && <p className="mt-3 text-sm text-accent animate-pulse">{progress}</p>}

          <button
            onClick={analyze}
            disabled={loading || !serverReady}
            className="mt-5 w-full flex items-center justify-center gap-2 bg-accent hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-xl transition-colors text-sm"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</>
            ) : !serverReady ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Connecting to server…</>
            ) : (
              <><Search className="w-4 h-4" /> Analyze Stocks</>
            )}
          </button>
        </div>

        {/* Feature pills */}
        <div className="mt-8 flex flex-wrap gap-3 justify-center max-w-2xl">
          {[
            { icon: '📊', label: 'Candlestick + Indicators' },
            { icon: '📈', label: 'RSI · MACD · Bollinger' },
            { icon: '🏦', label: 'Fundamental + ETF Analysis' },
            { icon: '🤖', label: 'AI Insights (Claude)' },
            { icon: '🎯', label: 'Entry Price & Target' },
            { icon: '📦', label: 'ETF: Sharpe · Calmar · Alpha' },
          ].map(f => (
            <span key={f.label} className="flex items-center gap-1.5 text-xs text-slate-400 bg-panel border border-border px-3 py-1.5 rounded-full">
              <span>{f.icon}</span>{f.label}
            </span>
          ))}
        </div>

        <p className="mt-6 text-xs text-slate-600">
          Data sourced from Yahoo Finance · For informational purposes only
        </p>
      </div>
    </div>
  )
}
