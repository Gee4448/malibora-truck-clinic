import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  // No background on the wrapper: an opaque one here would sit on top of the
  // ambient field painted on body::before, and every frosted card below would
  // have nothing but flat grey to refract.
  return (
    <div className="min-h-screen">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* No fixed left margin — sidebar is a drawer overlay on all screens. */}
      <div>
        <Header onMenuToggle={() => setSidebarOpen(true)} />
        {/* Key on pathname so navigation replays the entrance animation */}
        <main key={location.pathname} className="p-4 lg:p-6 animate-fade-in-up">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
