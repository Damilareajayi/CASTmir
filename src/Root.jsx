import { useState, useEffect } from 'react'
import Landing   from './Landing.jsx'
import Dashboard from './Dashboard.jsx'

export default function Root() {
  const [page, setPage] = useState(
    window.location.hash === '#dashboard' ? 'dashboard' : 'landing'
  )
  useEffect(() => {
    const sync = () =>
      setPage(window.location.hash === '#dashboard' ? 'dashboard' : 'landing')
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const toDash = () => { window.location.hash = '#dashboard'; setPage('dashboard') }
  const toHome = () => { window.location.hash = '';           setPage('landing')   }

  return page === 'dashboard'
    ? <Dashboard onBack={toHome} />
    : <Landing   onEnter={toDash} />
}
