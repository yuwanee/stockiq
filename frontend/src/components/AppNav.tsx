import { BarChart2, TrendingUp } from 'lucide-react'

export type AppView = 'stock' | 'options'

interface Props {
  active: AppView
  onNavigate: (v: AppView) => void
}

export default function AppNav({ active, onNavigate }: Props) {
  return (
    <div className="bg-panel border-b border-border sticky top-0 z-20">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center gap-6 h-14">
          {/* Brand */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
              <BarChart2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white tracking-tight">StockIQ</span>
          </div>

          {/* Tabs */}
          <nav className="flex h-full">
            <button
              onClick={() => onNavigate('stock')}
              className={`flex items-center gap-1.5 px-4 text-sm font-medium border-b-2 transition-colors ${
                active === 'stock'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              Stock Analysis
            </button>
            <button
              onClick={() => onNavigate('options')}
              className={`flex items-center gap-1.5 px-4 text-sm font-medium border-b-2 transition-colors ${
                active === 'options'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Options Scanner
            </button>
          </nav>
        </div>
      </div>
    </div>
  )
}
