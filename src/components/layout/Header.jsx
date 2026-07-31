import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { useNotifications } from '../../hooks/useNotifications'
import { formatDateTime } from '../../lib/supabase'
import { Menu, Bell, Globe, FileText, CreditCard, CheckCheck } from 'lucide-react'

export default function Header({ onMenuToggle }) {
  const { locale, switchLanguage, t } = useLanguage()
  const { profile } = useAuth()
  const { items, unreadCount, markAllRead, markRead } = useNotifications()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)

  // Close the panel on any outside click.
  useEffect(() => {
    if (!open) return
    const onClick = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const handleOpen = (notif) => {
    markRead(notif.id)
    setOpen(false)
    if (notif.invoice_id) navigate(`/admin/invoices/${notif.invoice_id}`)
    else if (notif.job_card_id) navigate(`/admin/job-cards/${notif.job_card_id}`)
    // A bargain alert usually fires while staff are ALREADY looking at that
    // inspection, so a plain navigate to the same route does nothing visible
    // and the bell feels broken. The state tells the page to bring the thread
    // into view; every navigate() gets a fresh location key, so repeat clicks
    // keep working.
    else if (notif.inspection_id) {
      navigate(`/admin/inspections/${notif.inspection_id}`,
        notif.type === 'inspection_bargain' ? { state: { focus: 'negotiation' } } : undefined)
    }
  }

  return (
    <header className="glass-header h-16 bg-white/85 border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
      {/* Left: Menu toggle — always visible; the sidebar is a drawer on every viewport. */}
      <button
        onClick={onMenuToggle}
        className="p-2 rounded-lg hover:bg-gray-100 press cursor-pointer"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5 text-gray-600" />
      </button>

      {/* Right side */}
      <div className="flex items-center gap-3 ml-auto">
        {/* Language toggle */}
        <button
          onClick={() => switchLanguage(locale === 'en' ? 'sw' : 'en')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 transition-colors press cursor-pointer"
          title={locale === 'en' ? 'Badilisha kwa Kiswahili' : 'Switch to English'}
        >
          <Globe className="w-4 h-4" />
          {locale === 'en' ? 'SW' : 'EN'}
        </button>

        {/* Notifications */}
        <div className="relative" ref={panelRef}>
          <button
            onClick={() => setOpen(o => !o)}
            className="relative p-2 rounded-lg hover:bg-gray-100 press cursor-pointer"
            aria-label={t('notifications.title')}
          >
            <Bell className="w-5 h-5 text-gray-600" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900">{t('notifications.title')}</p>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                    <CheckCheck className="w-3.5 h-3.5" /> {t('notifications.markAllRead')}
                  </button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {items.length === 0 ? (
                  <p className="text-center text-xs text-gray-400 py-8">{t('notifications.empty')}</p>
                ) : (
                  items.map((n) => {
                    const Icon = n.type === 'payment_declared' ? CreditCard : FileText
                    return (
                      <button
                        key={n.id}
                        onClick={() => handleOpen(n)}
                        className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition flex gap-3 ${n.is_read ? '' : 'bg-blue-50/40'}`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${n.type === 'payment_declared' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                          {n.body && <p className="text-xs text-gray-500 truncate">{n.body}</p>}
                          <p className="text-[10px] text-gray-400 mt-0.5">{formatDateTime(n.created_at)}</p>
                        </div>
                        {!n.is_read && <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>

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
