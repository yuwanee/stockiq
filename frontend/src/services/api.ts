import axios from 'axios'
import type { AnalysisResults } from '../types/stock'

const api = axios.create({ baseURL: '/api', timeout: 90000 })

export async function pingServer(): Promise<void> {
  try { await api.get('/health', { timeout: 30000 }) } catch {}
}

export async function analyzeStocks(symbols: string[]): Promise<AnalysisResults> {
  const { data } = await api.post<AnalysisResults>('/analyze', { symbols })
  return data
}
