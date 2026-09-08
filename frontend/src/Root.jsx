import { useState, useEffect } from 'react'
import Landing from './Landing.jsx'
import UserDashboard from './UserDashboard.jsx'
import AdminDashboard from './AdminDashboard.jsx'
import Privacy from './Privacy.jsx'

function routeFromHash() {
  const h = window.location.hash.replace('#', '')
  return ['user', 'admin', 'privacy'].includes(h) ? h : 'landing'
}

export default function Root() {
  const [view, setView] = useState(routeFromHash())

  useEffect(() => {
    const onHashChange = () => setView(routeFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const go = (v) => { window.location.hash = v === 'landing' ? '' : v; setView(v) }

  if (view === 'user') return <UserDashboard onBack={() => go('landing')} />
  if (view === 'admin') return <AdminDashboard onBack={() => go('landing')} />
  if (view === 'privacy') return <Privacy onBack={() => go('landing')} />
  return <Landing onEnterUser={() => go('user')} onEnterAdmin={() => go('admin')} />
}
