import { useState, KeyboardEvent } from 'react'
import { X, Search, Loader2 } from 'lucide-react'
import { analyzeStocks } from '../services/api'
import type { AnalysisResults } from '../types/stock'
import AppNav, { type AppView } from '../components/AppNav'

const EXAMPLES = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'GOOGL', 'SPY', 'QQQ', 'VTI', 'ARKK', 'GLD', 'AGG', 'XLK']

interface Props {
  onResults: (r: AnalysisResults) => void
  onNavigate: (v: AppView) => void
}

export default function InputPage({ onResults, onNavigate }: Props) {
  const [input, setInput] = useState('')
  const [symbols, setSymbols] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')

  function addSymbol(raw: string) {
    const parts = raw.toUpperCase().split(/[\s,;]+/).filter(Boolean)
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
      setError(e?.response?.data?.detail || e.message || 'Analysis failed. Is the backend running?')
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
          <label className="block text-sm font-medium text-slate-300 mb-3">Stock Symbols</label>

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

          {/* Quick picks */}
          <div className="mt-4">
            <p className="text-xs text-slate-500 mb-2">Quick picks:</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map(s => (
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

          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          {progress && <p className="mt-3 text-sm text-accent animate-pulse">{progress}</p>}

          <button
            onClick={analyze}
            disabled={loading}
            className="mt-5 w-full flex items-center justify-center gap-2 bg-accent hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-xl transition-colors text-sm"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</>
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
