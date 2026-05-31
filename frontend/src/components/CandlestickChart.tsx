import { useEffect, useRef } from 'react'
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts'
import type { TechnicalData } from '../types/stock'

interface Props {
  technical: TechnicalData
  currentPrice: number
}

export default function CandlestickChart({ technical, currentPrice }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

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

    if (technical.support) {
      const supLine = chart.addLineSeries({ color: 'rgba(34,197,94,0.6)', lineWidth: 1, lineStyle: LineStyle.Dotted })
      const last = technical.candles[technical.candles.length - 1]
      const first = technical.candles[Math.max(0, technical.candles.length - 90)]
      supLine.setData([{ time: first.time as any, value: technical.support }, { time: last.time as any, value: technical.support }])
    }

    const ro = new ResizeObserver(entries => {
      if (entries[0]) chart.applyOptions({ width: entries[0].contentRect.width })
    })
    ro.observe(containerRef.current)

    chart.timeScale().fitContent()

    return () => {
      ro.disconnect()
      chart.remove()
    }
  }, [technical])

  return (
    <div>
      <div ref={containerRef} className="w-full" />
      <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-400">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 inline-block" />SMA20</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-400 inline-block" />SMA50</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-purple-400 inline-block" />SMA200</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-slate-400 inline-block border-dashed" />Bollinger Bands</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-500 inline-block" />Support</span>
      </div>
    </div>
  )
}
