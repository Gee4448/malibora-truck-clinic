import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useClient } from '../../contexts/ClientAuthContext'
import {
  Home, Truck, ClipboardList, FileText, ClipboardCheck, Search, User, Globe, LogOut
} from 'lucide-react'

export default function ClientLayout() {
  const { t, locale, switchLanguage } = useLanguage()
  const { customer, logout } = useClient()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/client')
  }

  const tabs = [
    { to: '/client/dashboard', icon: Home, label: t('client.nav.home'), end: true },
    { to: '/client/vehicles', icon: Truck, label: t('client.nav.vehicles') },
    { to: '/client/services', icon: ClipboardList, label: t('client.nav.jobCards') },
    { to: '/client/inspections', icon: Search, label: t('client.nav.inspections') },
    { to: '/client/invoices', icon: FileText, label: t('client.nav.invoices') },
    { to: '/client/handovers', icon: ClipboardCheck, label: t('client.nav.handovers') },
  ]

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-0">
      {/* Top Header */}
      <header className="glass-header bg-blue-800/95 text-white sticky top-0 z-40 shadow-lg shadow-blue-900/10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Truck className="w-7 h-7" />
            <div>
              <h1 className="text-sm font-bold leading-tight">{t('app.name')}</h1>
              <p className="text-blue-200 text-[10px]">{customer?.full_name}</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 press ${
                    isActive ? 'bg-white/20 text-white shadow-sm' : 'text-blue-200 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/client/profile"
              aria-label={t('client.nav.profile')}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors press cursor-pointer"
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
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors press cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Page Content — key on pathname so each tab change replays the entrance */}
      <main key={location.pathname} className="max-w-3xl mx-auto px-4 py-5 animate-fade-in-up">
        <Outlet />
      </main>

      {/* Bottom Tab Navigation (mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 glass-header bg-white/90 border-t border-gray-200 z-40 lg:hidden safe-area-bottom shadow-[0_-4px_20px_-8px_rgb(0_0_0/0.1)]">
        <div className="max-w-3xl mx-auto flex">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                // min-w-0 + a truncating label: with six tabs each cell is ~62px
                // on a 375px phone, and a long translation would otherwise push
                // the bar into a horizontal scroll.
                `flex-1 min-w-0 flex flex-col items-center gap-0.5 py-2 pt-2.5 text-[10px] font-medium transition-colors duration-200 ${
                  isActive ? 'text-blue-700 nav-tab-active' : 'text-gray-400 hover:text-gray-600'
                }`
              }
            >
              <tab.icon className="w-5 h-5 flex-shrink-0" />
              <span className="max-w-full truncate px-0.5">{tab.label}</span>
              <span className="nav-dot" />
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
