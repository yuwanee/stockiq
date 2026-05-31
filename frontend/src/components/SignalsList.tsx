import type { Signal } from '../types/stock'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

function StrengthDots({ n }: { n: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3].map(i => (
        <span key={i} className={`w-1.5 h-1.5 rounded-full ${i <= n ? 'bg-current opacity-100' : 'bg-slate-600 opacity-30'}`} />
      ))}
    </span>
  )
}

export default function SignalsList({ signals }: { signals: Signal[] }) {
  const bull = signals.filter(s => s.type === 'BULLISH')
  const bear = signals.filter(s => s.type === 'BEARISH')
  const neutral = signals.filter(s => s.type === 'NEUTRAL')

  function Section({ title, items, color }: { title: string; items: Signal[]; color: string }) {
    if (!items.length) return null
    return (
      <div>
        <h4 className={`text-xs font-bold uppercase tracking-wider mb-2 ${color}`}>{title} ({items.length})</h4>
        <div className="space-y-2">
          {items.map((s, i) => (
            <div key={i} className="bg-surface border border-border rounded-lg p-3 flex items-start gap-3">
              <div className={`mt-0.5 ${color}`}>
                {s.type === 'BULLISH' ? <TrendingUp className="w-4 h-4" /> :
                 s.type === 'BEARISH' ? <TrendingDown className="w-4 h-4" /> :
                 <Minus className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-200">{s.indicator}: {s.name}</span>
                  <span className={`flex-shrink-0 ${color}`}>
                    <StrengthDots n={s.strength} />
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{s.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Section title="Bullish Signals" items={bull} color="text-green-400" />
      <Section title="Bearish Signals" items={bear} color="text-red-400" />
      <Section title="Neutral / Watch" items={neutral} color="text-yellow-400" />
    </div>
  )
}
