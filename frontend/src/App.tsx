import { useState } from 'react'
import InputPage from './pages/InputPage'
import AnalysisPage from './pages/AnalysisPage'
import type { AnalysisResults } from './types/stock'

export default function App() {
  const [results, setResults] = useState<AnalysisResults | null>(null)

  if (results) {
    return <AnalysisPage results={results} onBack={() => setResults(null)} />
  }
  return <InputPage onResults={setResults} />
}
