import { useState, useEffect } from 'react'
import InputPage from './pages/InputPage'
import AnalysisPage from './pages/AnalysisPage'
import OptionsPage from './pages/OptionsPage'
import type { AnalysisResults } from './types/stock'
import { pingServer } from './services/api'

type View = 'stock' | 'options' | 'analysis'

export default function App() {
  const [view, setView] = useState<View>('stock')
  const [results, setResults] = useState<AnalysisResults | null>(null)
  const [serverReady, setServerReady] = useState(false)

  useEffect(() => {
    pingServer().finally(() => setServerReady(true))
  }, [])

  if (view === 'analysis' && results) {
    return <AnalysisPage results={results} onBack={() => setView('stock')} />
  }
  if (view === 'options') {
    return <OptionsPage onNavigate={setView} />
  }
  return (
    <>
      {!serverReady && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-slate-800 border-b border-border py-2 text-xs text-slate-400">
          <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          Connecting to server — this may take up to 30 s on first load…
        </div>
      )}
      <InputPage
        onResults={r => { setResults(r); setView('analysis') }}
        onNavigate={setView}
        serverReady={serverReady}
      />
    </>
  )
}
