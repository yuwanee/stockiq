import axios from 'axios'
import type { AnalysisResults } from '../types/stock'

const api = axios.create({ baseURL: '/api' })

export async function analyzeStocks(symbols: string[]): Promise<AnalysisResults> {
  const { data } = await api.post<AnalysisResults>('/analyze', { symbols })
  return data
}
