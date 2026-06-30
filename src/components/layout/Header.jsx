import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { Menu, Bell, Globe } from 'lucide-react'

export default function Header({ onMenuToggle }) {
  const { locale, switchLanguage } = useLanguage()
  const { profile } = useAuth()

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6">
      {/* Left: Menu toggle — always visible; the sidebar is a drawer on every viewport. */}
      <button
        onClick={onMenuToggle}
        className="p-2 rounded-lg hover:bg-gray-100"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5 text-gray-600" />
      </button>

      {/* Right side */}
      <div className="flex items-center gap-3 ml-auto">
        {/* Language toggle */}
        <button
          onClick={() => switchLanguage(locale === 'en' ? 'sw' : 'en')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 transition-colors"
          title={locale === 'en' ? 'Badilisha kwa Kiswahili' : 'Switch to English'}
        >
          <Globe className="w-4 h-4" />
          {locale === 'en' ? 'SW' : 'EN'}
        </button>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-gray-100">
          <Bell className="w-5 h-5 text-gray-600" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        {/* User info */}
        <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
            {profile?.full_name?.charAt(0) || 'U'}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-gray-900">{profile?.full_name || 'User'}</p>
            <p className="text-xs text-gray-500 capitalize">{profile?.role || 'staff'}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
