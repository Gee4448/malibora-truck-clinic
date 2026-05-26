import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useClient } from '../../contexts/ClientAuthContext'
import {
  Home, Truck, ClipboardList, FileText, User, Globe, LogOut
} from 'lucide-react'

export default function ClientLayout() {
  const { t, locale, switchLanguage } = useLanguage()
  const { customer, logout } = useClient()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/client')
  }

  const tabs = [
    { to: '/client/dashboard', icon: Home, label: t('client.nav.home'), end: true },
    { to: '/client/vehicles', icon: Truck, label: t('client.nav.vehicles') },
    { to: '/client/services', icon: ClipboardList, label: t('client.nav.services') },
    { to: '/client/invoices', icon: FileText, label: t('client.nav.invoices') },
    { to: '/client/profile', icon: User, label: t('client.nav.profile') },
  ]

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-0">
      {/* Top Header */}
      <header className="bg-blue-800 text-white sticky top-0 z-40">
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
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isActive ? 'bg-white/20 text-white' : 'text-blue-200 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => switchLanguage(locale === 'en' ? 'sw' : 'en')}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              {locale === 'en' ? 'SW' : 'EN'}
            </button>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Page Content */}
      <main className="max-w-3xl mx-auto px-4 py-5">
        <Outlet />
      </main>

      {/* Bottom Tab Navigation (mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 lg:hidden safe-area-bottom">
        <div className="max-w-3xl mx-auto flex">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center gap-0.5 py-2 pt-2.5 text-[10px] font-medium transition-colors ${
                  isActive ? 'text-blue-700' : 'text-gray-400'
                }`
              }
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
