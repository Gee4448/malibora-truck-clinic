import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useChevTrack } from '../../hooks/useChevTrack'
import { useScrollChrome } from '../../hooks/useScrollChrome'
import { useClient } from '../../contexts/ClientAuthContext'
import {
  Home, Truck, ClipboardList, FileText, ClipboardCheck, Search, User, Globe, LogOut
} from 'lucide-react'

export default function ClientLayout() {
  const { t, locale, switchLanguage } = useLanguage()
  const { customer, logout } = useClient()
  const navigate = useNavigate()
  const location = useLocation()
  useScrollChrome(location.pathname)

  const handleLogout = () => {
    logout()
    navigate('/client')
  }

  // Order follows the customer's own journey: inspection first (that is where a
  // job starts), then the job card it turns into, then the bill, then handback.
  const tabs = [
    { to: '/client/dashboard', icon: Home, label: t('client.nav.home'), end: true },
    { to: '/client/vehicles', icon: Truck, label: t('client.nav.vehicles') },
    { to: '/client/inspections', icon: Search, label: t('client.nav.inspections') },
    { to: '/client/services', icon: ClipboardList, label: t('client.nav.jobCards') },
    { to: '/client/invoices', icon: FileText, label: t('client.nav.invoices') },
    { to: '/client/handovers', icon: ClipboardCheck, label: t('client.nav.handovers') },
  ]

  // Longest match wins: /client/invoices/42 is still the Invoices tab, and the
  // `end` tab (home) must not swallow every path below it.
  const activeIndex = tabs.reduce((best, tab, i) => {
    const hit = tab.end ? location.pathname === tab.to : location.pathname.startsWith(tab.to)
    return hit && (best < 0 || tab.to.length > tabs[best].to.length) ? i : best
  }, -1)
  const trackRef = useChevTrack(activeIndex)

  return (
    <div className="min-h-screen">
      {/* Top Header */}
      <header className="app-bar sticky top-0 z-40">
        <div className="bar-row max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* The mark is the one saturated thing in the bar; everything else
                is white at varying opacity. That is what stops a dark header
                from turning into a row of competing brand colours. */}
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 ring-1 ring-white/20 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5 text-white" />
            </span>
            <div>
              <h1 className="text-sm font-bold leading-tight text-white">{t('app.name')}</h1>
              <p className="on-dark-muted text-[10px]">{customer?.full_name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/client/profile"
              aria-label={t('client.nav.profile')}
              className="tap p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors press cursor-pointer"
            >
              <User className="w-4 h-4" />
            </Link>
            <button
              onClick={() => switchLanguage(locale === 'en' ? 'sw' : 'en')}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 transition-colors press cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              {locale === 'en' ? 'SW' : 'EN'}
            </button>
            <button
              onClick={handleLogout}
              aria-label={t('nav.logout')}
              className="tap p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors press cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation — the same chevron ribbon as the stage tracker
            (`.chev-track` in index.css), so the portal's two horizontal bars
            share one language.

            ONE ribbon at every breakpoint, in the sticky header. It used to be
            desktop-only, with a separate bottom tab bar below `lg` — two
            different navs in two different styles for the same six
            destinations. The phone now gets the same control the desktop has,
            pinned to the top where it stays put while the page scrolls.

            It gets its own full-width row rather than sitting beside the logo:
            squeezed into the header row, six labels wrapped onto two lines
            ("My / Vehicles", "Job / Cards"). Here they never wrap, and if a
            translation is long the ribbon scrolls instead of breaking. */}
        <nav className="border-t border-white/10">
          <div className="max-w-3xl mx-auto px-4 py-2">
            <div ref={trackRef} className="chev-track">
              {tabs.map((tab, i) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.end}
                  style={{ '--seg-i': i }}
                  className={({ isActive }) =>
                    // py-3.5 under lg: the label's line box is 16px, so 14px of
                    // padding each side is exactly the 44px a thumb needs.
                    // Measured at 390px — py-2 gives 32px and py-2.5 gives 36.
                    // The desktop row keeps its tighter rhythm, where the
                    // pointer is precise and vertical space is worth more.
                    `chev flex items-center justify-center gap-1.5 py-3.5 lg:py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                      isActive
                        // blue-600 (#c74301), not the brand 500: these labels are
                        // 12px bold, which is not "large text", so 500's 3.8:1
                        // against white would fail AA. 600 gives 4.96:1.
                        ? 'bg-blue-600 text-white'
                        : 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white'
                    }`
                  }
                >
                  <tab.icon className="w-3.5 h-3.5 flex-shrink-0" />
                  {tab.label}
                </NavLink>
              ))}
            </div>
          </div>
        </nav>
      </header>

      {/* Page Content — key on pathname so each tab change replays the entrance */}
      <main key={location.pathname} className="max-w-3xl mx-auto px-4 py-5 animate-fade-in-up">
        <Outlet />
      </main>

    </div>
  )
}
