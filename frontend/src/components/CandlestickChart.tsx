import { useEffect, useRef, useState } from 'react'
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts'
import type { TechnicalData } from '../types/stock'

interface Props {
  technical: TechnicalData
  currentPrice?: number
}

type TimeRange = '3M' | '6M' | '1Y'

export default function CandlestickChart({ technical }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null)
  const [range, setRange] = useState<TimeRange>('1Y')

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0f1117' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1e2130' },
        horzLines: { color: '#1e2130' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#2a2d3a' },
      timeScale: { borderColor: '#2a2d3a', timeVisible: true },
      width: containerRef.current.clientWidth,
      height: 340,
    })
    chartRef.current = chart

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    })
    candleSeries.setData(
      technical.candles.map(c => ({ time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close }))
    )

    // Volume histogram overlaid at the bottom
    const volSeries = chart.addHistogramSeries({
      color: 'rgba(59,130,246,0.4)',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, visible: false })
    volSeries.setData(technical.candles.map(c => ({
      time: c.time as any,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)',
    })))

    const sma20 = chart.addLineSeries({ color: '#3b82f6', lineWidth: 1, title: 'SMA20' })
    sma20.setData(technical.indicators.sma20.map(d => ({ time: d.time as any, value: d.value })))

    const sma50 = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, title: 'SMA50' })
    sma50.setData(technical.indicators.sma50.map(d => ({ time: d.time as any, value: d.value })))

    const sma200 = chart.addLineSeries({ color: '#a855f7', lineWidth: 1, title: 'SMA200' })
    sma200.setData(technical.indicators.sma200.map(d => ({ time: d.time as any, value: d.value })))

    const bbUpper = chart.addLineSeries({ color: 'rgba(148,163,184,0.4)', lineWidth: 1, lineStyle: LineStyle.Dashed })
    bbUpper.setData(technical.indicators.bb_upper.map(d => ({ time: d.time as any, value: d.value })))

    const bbLower = chart.addLineSeries({ color: 'rgba(148,163,184,0.4)', lineWidth: 1, lineStyle: LineStyle.Dashed })
    bbLower.setData(technical.indicators.bb_lower.map(d => ({ time: d.time as any, value: d.value })))

    const last = technical.candles[technical.candles.length - 1]
    const first = technical.candles[Math.max(0, technical.candles.length - 90)]

    if (technical.support) {
      const supLine = chart.addLineSeries({ color: 'rgba(34,197,94,0.6)', lineWidth: 1, lineStyle: LineStyle.Dotted })
      supLine.setData([{ time: first.time as any, value: technical.support }, { time: last.time as any, value: technical.support }])
    }

    if (technical.resistance) {
      const resLine = chart.addLineSeries({ color: 'rgba(239,68,68,0.6)', lineWidth: 1, lineStyle: LineStyle.Dotted })
      resLine.setData([{ time: first.time as any, value: technical.resistance }, { time: last.time as any, value: technical.resistance }])
    }

    const ro = new ResizeObserver(entries => {
      if (entries[0]) chart.applyOptions({ width: entries[0].contentRect.width })
    })
    ro.observe(containerRef.current)

    chart.timeScale().fitContent()

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [technical])

  // Apply visible time range when range selection changes
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !technical.candles.length) return
    const toDate = technical.candles[technical.candles.length - 1].time
    const from = new Date(toDate)
    if (range === '3M') from.setMonth(from.getMonth() - 3)
    else if (range === '6M') from.setMonth(from.getMonth() - 6)
    else from.setFullYear(from.getFullYear() - 1)
    const fromDate = from.toISOString().split('T')[0]
    chart.timeScale().setVisibleRange({ from: fromDate as any, to: toDate as any })
  }, [range, technical])

  return (
    <div>
      <div className="flex gap-1 mb-3">
        {(['3M', '6M', '1Y'] as TimeRange[]).map(r => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
              range === r ? 'bg-accent text-white' : 'bg-surface text-slate-400 hover:text-slate-200 border border-border'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <div ref={containerRef} className="w-full" />
      <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-400">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 inline-block" />SMA20</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-400 inline-block" />SMA50</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-purple-400 inline-block" />SMA200</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-slate-400 inline-block" />BB</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-500 inline-block" />Support</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-500 inline-block" />Resistance</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm inline-block bg-blue-500/40" />Volume</span>
      </div>
    </div>
  )
}
