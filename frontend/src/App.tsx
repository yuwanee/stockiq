import { useState } from 'react'
import InputPage from './pages/InputPage'
import AnalysisPage from './pages/AnalysisPage'
import OptionsPage from './pages/OptionsPage'
import type { AnalysisResults } from './types/stock'

type View = 'stock' | 'options' | 'analysis'

export default function App() {
  const [view, setView] = useState<View>('stock')
  const [results, setResults] = useState<AnalysisResults | null>(null)

  if (view === 'analysis' && results) {
    return <AnalysisPage results={results} onBack={() => setView('stock')} />
  }
  if (view === 'options') {
    return <OptionsPage onNavigate={setView} />
  }
  return (
    <InputPage
      onResults={r => { setResults(r); setView('analysis') }}
      onNavigate={setView}
    />
  )
}
