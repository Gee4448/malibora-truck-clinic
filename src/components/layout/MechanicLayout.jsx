import { Outlet, useNavigate } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useMechanic } from '../../contexts/MechanicAuthContext'
import { Wrench, Globe, LogOut } from 'lucide-react'

export default function MechanicLayout() {
  const { t, locale, switchLanguage } = useLanguage()
  const { mechanic, logout } = useMechanic()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/mechanic')
  }

  return (
    <div className="min-h-screen">
      {/* Same app-bar material as the office and client shells. The mechanic
          portal used slate + amber, which read as a third brand; on one dark
          material the three portals finally look like one product. */}
      <header className="app-bar sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-gradient-to-br from-blue-500 to-blue-700 ring-1 ring-white/20 rounded-xl p-2">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight text-white">{t('mechanic.login.portal')}</h1>
              <p className="on-dark-muted text-[10px]">{mechanic?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => switchLanguage(locale === 'en' ? 'sw' : 'en')}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium font-display text-white/85 bg-white/10 hover:bg-white/20 hover:text-white transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              {locale === 'en' ? 'SW' : 'EN'}
            </button>
            <button onClick={handleLogout} className="p-1.5 rounded-lg text-white/85 bg-white/10 hover:bg-white/20 hover:text-white transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 animate-fade-in-up">
        <Outlet />
      </main>
    </div>
  )
}
