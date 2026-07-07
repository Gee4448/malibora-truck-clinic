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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-800 text-white sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-amber-500 rounded-lg p-1.5">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight">{t('mechanic.login.portal')}</h1>
              <p className="text-slate-300 text-[10px]">{mechanic?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => switchLanguage(locale === 'en' ? 'sw' : 'en')}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              {locale === 'en' ? 'SW' : 'EN'}
            </button>
            <button onClick={handleLogout} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5">
        <Outlet />
      </main>
    </div>
  )
}
