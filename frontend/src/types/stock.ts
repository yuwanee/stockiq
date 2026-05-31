export interface TimeSeriesPoint {
  time: string
  value: number
}

export interface CandlePoint {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Signal {
  type: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  indicator: string
  name: string
  strength: number
  detail: string
}

export interface TechnicalData {
  candles: CandlePoint[]
  indicators: {
    sma20: TimeSeriesPoint[]
    sma50: TimeSeriesPoint[]
    sma200: TimeSeriesPoint[]
    ema12: TimeSeriesPoint[]
    ema26: TimeSeriesPoint[]
    rsi: TimeSeriesPoint[]
    macd: TimeSeriesPoint[]
    macd_signal: TimeSeriesPoint[]
    macd_hist: TimeSeriesPoint[]
    bb_upper: TimeSeriesPoint[]
    bb_middle: TimeSeriesPoint[]
    bb_lower: TimeSeriesPoint[]
    stoch_k: TimeSeriesPoint[]
    stoch_d: TimeSeriesPoint[]
    atr: TimeSeriesPoint[]
    obv: TimeSeriesPoint[]
  }
  signals: Signal[]
  support: number
  resistance: number
  fib_levels: Record<string, number>
  atr: number
}

export interface FundamentalData {
  pe_ratio: number | null
  forward_pe: number | null
  peg_ratio: number | null
  pb_ratio: number | null
  ps_ratio: number | null
  ev_ebitda: number | null
  revenue_growth: number | null
  earnings_growth: number | null
  gross_margins: number | null
  operating_margins: number | null
  profit_margins: number | null
  roe: number | null
  roa: number | null
  debt_to_equity: number | null
  current_ratio: number | null
  quick_ratio: number | null
  free_cash_flow: number | null
  dividend_yield: number | null
  eps: number | null
  forward_eps: number | null
  book_value: number | null
  revenue: number | null
  net_income: number | null
  analyst_recommendation: string
  recommendation_mean: number | null
  target_high: number | null
  target_low: number | null
  target_mean: number | null
  analyst_count: number | null
  description: string
  news: NewsItem[]
  fundamental_score: number
}

export interface NewsItem {
  title: string
  publisher: string
  link: string
  publishedAt: number
}

export interface Recommendation {
  action: string
  label: string
  confidence: number
  technical_score: number
  fundamental_score: number
  combined_score: number
  bullish_count: number
  bearish_count: number
  neutral_count: number
}

export interface EntryPoint {
  suggested_price: number
  note: string
  target_mean: number | null
  target_high: number | null
  target_low: number | null
  upside_pct: number | null
}

export interface AIAnalysis {
  technical_summary: string
  fundamental_summary: string
  investment_thesis: string
  key_risks: string[]
  key_catalysts: string[]
  entry_strategy: string
  price_target_6m: string
  when_to_buy: string
}


export interface PerformanceMetrics {
  return_1y: number
  total_return: number
  annualized_volatility: number
  sharpe_ratio: number
  sortino_ratio: number
  calmar_ratio: number
  max_drawdown: number
  var_95: number
  cvar_95: number
  win_rate: number
  profit_factor: number
  skewness: number
  kurtosis: number
  positive_months: number
  total_months: number
}

export interface BenchmarkComparison {
  benchmark: string
  beta: number
  alpha_annualized: number
  correlation: number
  r_squared: number
  tracking_error: number
  information_ratio: number
  etf_return_1y: number
  benchmark_return_1y: number
  relative_performance: number
  up_capture: number
  down_capture: number
}

export interface ETFHolding {
  symbol: string
  name: string
  weight: number
}

export interface ETFData {
  performance_metrics: PerformanceMetrics
  benchmark_comparison: BenchmarkComparison
  holdings: {
    top_holdings: ETFHolding[]
    sector_weightings: Record<string, number>
    asset_classes: Record<string, number>
    equity_holdings: Record<string, unknown>
    bond_holdings: Record<string, unknown>
  }
  expense_ratio: number | null
  aum: number | null
  distribution_yield: number | null
  category: string | null
  fund_family: string | null
  beta_3y: number | null
  return_3y: number | null
  return_5y: number | null
  ytd_return: number | null
  nav_price: number | null
  description: string
}

export interface StockResult {
  symbol: string
  is_etf: boolean
  company_name: string
  sector: string
  industry: string
  current_price: number
  currency: string
  market_cap: number | null
  week52_high: number
  week52_low: number
  technical: TechnicalData
  fundamental: FundamentalData
  etf_data: ETFData | null
  recommendation: Recommendation
  entry_point: EntryPoint
  ai_analysis: AIAnalysis | null
  error?: string
}

export type AnalysisResults = Record<string, StockResult>
