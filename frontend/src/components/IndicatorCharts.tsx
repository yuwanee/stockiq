import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { TechnicalData } from '../types/stock'

function fmt(v: number | undefined) {
  if (v === undefined || v === null) return 'N/A'
  return typeof v === 'number' ? v.toFixed(2) : v
}

function buildRsiData(tech: TechnicalData) {
  const rsiMap = new Map(tech.indicators.rsi.map(d => [d.time, d.value]))
  const stochKMap = new Map(tech.indicators.stoch_k.map(d => [d.time, d.value]))
  const stochDMap = new Map(tech.indicators.stoch_d.map(d => [d.time, d.value]))
  return tech.candles.slice(-180).map(c => ({
    time: c.time.slice(5),
    rsi: rsiMap.get(c.time),
    stoch_k: stochKMap.get(c.time),
    stoch_d: stochDMap.get(c.time),
  })).filter(d => d.rsi !== undefined)
}

function buildMacdData(tech: TechnicalData) {
  const macdMap = new Map(tech.indicators.macd.map(d => [d.time, d.value]))
  const sigMap = new Map(tech.indicators.macd_signal.map(d => [d.time, d.value]))
  const histMap = new Map(tech.indicators.macd_hist.map(d => [d.time, d.value]))
  return tech.candles.slice(-180).map(c => ({
    time: c.time.slice(5),
    macd: macdMap.get(c.time),
    signal: sigMap.get(c.time),
    hist: histMap.get(c.time),
  })).filter(d => d.macd !== undefined)
}

function buildVolData(tech: TechnicalData) {
  return tech.candles.slice(-180).map(c => ({
    time: c.time.slice(5),
    volume: c.volume,
    color: c.close >= c.open ? '#22c55e' : '#ef4444',
  }))
}

function ChartCard({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="bg-panel border border-border rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-3">{title}</h3>
      {children}
    </div>
  )
}

const TICK_STYLE = { fontSize: 10, fill: '#64748b' }

export default function IndicatorCharts({ technical }: { technical: TechnicalData }) {
  const rsiData = buildRsiData(technical)
  const macdData = buildMacdData(technical)
  const volData = buildVolData(technical)
  const latestRsi = technical.indicators.rsi.at(-1)?.value
  const latestMacd = technical.indicators.macd.at(-1)?.value
  const latestSig = technical.indicators.macd_signal.at(-1)?.value

  return (
    <div className="space-y-4">
      {/* RSI */}
      <ChartCard title={`RSI(14) — current: ${latestRsi ? latestRsi.toFixed(1) : '—'} ${latestRsi && latestRsi < 30 ? '🟢 Oversold' : latestRsi && latestRsi > 70 ? '🔴 Overbought' : '⚪ Neutral'}`}>
        <ResponsiveContainer width="100%" height={120}>
          <ComposedChart data={rsiData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2130" />
            <XAxis dataKey="time" tick={TICK_STYLE} interval={29} />
            <YAxis domain={[0, 100]} tick={TICK_STYLE} ticks={[0, 30, 50, 70, 100]} />
            <Tooltip
              contentStyle={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8 }}
              labelStyle={{ color: '#94a3b8', fontSize: 11 }}
              itemStyle={{ fontSize: 11 }}
              formatter={(v: number) => [v.toFixed(1), '']}
            />
            <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} />
            <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="3 3" strokeWidth={1} />
            <ReferenceLine y={50} stroke="#475569" strokeDasharray="2 2" strokeWidth={1} />
            <Line type="monotone" dataKey="rsi" stroke="#3b82f6" dot={false} strokeWidth={1.5} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-xs text-slate-500 mt-1">Oversold &lt;30 (bullish), Overbought &gt;70 (bearish)</p>
      </ChartCard>

      {/* MACD */}
      <ChartCard title={`MACD(12,26,9) — ${latestMacd && latestSig ? (latestMacd > latestSig ? '🟢 Bullish' : '🔴 Bearish') : '—'}`}>
        <ResponsiveContainer width="100%" height={120}>
          <ComposedChart data={macdData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2130" />
            <XAxis dataKey="time" tick={TICK_STYLE} interval={29} />
            <YAxis tick={TICK_STYLE} />
            <Tooltip
              contentStyle={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8 }}
              labelStyle={{ color: '#94a3b8', fontSize: 11 }}
              itemStyle={{ fontSize: 11 }}
              formatter={(v: number) => [v.toFixed(4), '']}
            />
            <ReferenceLine y={0} stroke="#475569" strokeWidth={1} />
            <Bar dataKey="hist" fill="#3b82f6" opacity={0.6} radius={[1, 1, 0, 0]}
              isAnimationActive={false}
              label={false}
            />
            <Line type="monotone" dataKey="macd" stroke="#22c55e" dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="signal" stroke="#ef4444" dot={false} strokeWidth={1.5} />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="flex gap-4 text-xs text-slate-500 mt-1">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-500 inline-block" />MACD</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-500 inline-block" />Signal</span>
          <span className="flex items-center gap-1"><span className="w-3 h-1.5 bg-blue-500 opacity-60 inline-block" />Histogram</span>
        </div>
      </ChartCard>

      {/* Stochastic */}
      <ChartCard title="Stochastic Oscillator (14,3)">
        <ResponsiveContainer width="100%" height={100}>
          <ComposedChart data={rsiData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2130" />
            <XAxis dataKey="time" tick={TICK_STYLE} interval={29} />
            <YAxis domain={[0, 100]} tick={TICK_STYLE} ticks={[0, 20, 80, 100]} />
            <Tooltip
              contentStyle={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8 }}
              labelStyle={{ color: '#94a3b8', fontSize: 11 }}
              itemStyle={{ fontSize: 11 }}
              formatter={(v: number) => [v.toFixed(1), '']}
            />
            <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} />
            <ReferenceLine y={20} stroke="#22c55e" strokeDasharray="3 3" strokeWidth={1} />
            <Line type="monotone" dataKey="stoch_k" stroke="#f59e0b" dot={false} strokeWidth={1.5} name="%K" />
            <Line type="monotone" dataKey="stoch_d" stroke="#a855f7" dot={false} strokeWidth={1.5} name="%D" />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-xs text-slate-500 mt-1">Overbought &gt;80, Oversold &lt;20</p>
      </ChartCard>

      {/* Volume */}
      <ChartCard title="Volume">
        <ResponsiveContainer width="100%" height={100}>
          <ComposedChart data={volData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2130" />
            <XAxis dataKey="time" tick={TICK_STYLE} interval={29} />
            <YAxis tick={TICK_STYLE} tickFormatter={v => v >= 1e9 ? `${(v/1e9).toFixed(0)}B` : v >= 1e6 ? `${(v/1e6).toFixed(0)}M` : `${(v/1e3).toFixed(0)}K`} />
            <Tooltip
              contentStyle={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8 }}
              labelStyle={{ color: '#94a3b8', fontSize: 11 }}
              itemStyle={{ fontSize: 11 }}
              formatter={(v: number) => [v.toLocaleString(), 'Volume']}
            />
            <Bar dataKey="volume" fill="#3b82f6" opacity={0.7} radius={[1, 1, 0, 0]} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
