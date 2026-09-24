import { useState, useRef, useEffect } from 'react'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase, accountSlots } from '../../lib/supabase'
import { fromLoginEmail } from '../../lib/staffAccounts'
import { switchNeedsPassword } from '../../lib/accountSlots'
import AccountSwitchRow from '../common/AccountSwitchRow'
import { ChevronDown, LogOut, UserPlus, ArrowLeftRight } from 'lucide-react'

// The avatar in the app bar, and the menu it opens: who this tab is signed in
// as, "Add another account" (a new tab, where someone else logs in while this
// tab stays as it is), the way back to this browser's own account when this
// tab is on an added one, and sign out. See src/lib/accountSlots.js.
export default function AccountMenu() {
  const { t } = useLanguage()
  const { user, profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [device, setDevice] = useState(null)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // This browser's own account, offered only in a tab that is on an added
  // one — and not when that is the same person.
  const deviceToOffer = () => {
    if (accountSlots.isDeviceTab()) return null
    const d = accountSlots.deviceAccount()
    return d && d.userId !== user?.id ? d : null
  }

  const toggle = () => {
    if (!open) setDevice(deviceToOffer())
    setOpen(!open)
  }

  // The stored session only knows what sign-up recorded; the roster has the
  // current name and role, and the role decides whether a password is asked.
  useEffect(() => {
    if (!open) return
    const d = deviceToOffer()
    if (!d) return
    let cancelled = false
    supabase.from('profiles').select('id, full_name, role').eq('id', d.userId).maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setDevice({ ...d, name: data.full_name || d.name, role: data.role || null })
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const roleLabel = (role) => (role ? t(`staffAdmin.roles.${role}`) : t('accounts.unknownRole'))
  const initial = (name) => (name || '?').trim().charAt(0).toUpperCase()

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('accounts.menu')}
        className="flex items-center gap-2 pl-3 border-l border-white/15 rounded-lg press cursor-pointer hover:bg-white/10 pr-2 py-1"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 ring-1 ring-white/25 flex items-center justify-center text-white text-sm font-bold font-display">
          {initial(profile?.full_name) === '?' ? 'U' : initial(profile?.full_name)}
        </div>
        <div className="hidden sm:block text-left">
          <p className="text-sm font-medium text-white">{profile?.full_name || 'User'}</p>
          <p className="text-xs on-dark-muted capitalize">{profile?.role || 'staff'}</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-white/60 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        // Positioning and material on separate elements: `.glass-strong` sets
        // position: relative for its lit edge, and being plain CSS it beats
        // Tailwind's layered `absolute` — put both on one box and the panel
        // pushes into the page instead of floating over it.
        <div role="menu" className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] z-50">
        <div className="glass-strong rounded-2xl shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">{t('accounts.signedInAs')}</p>
            <p className="text-sm font-semibold text-gray-900 truncate">{profile?.full_name || 'User'}</p>
            <p className="text-xs text-gray-500 truncate">
              {fromLoginEmail(user?.email)}{profile?.role ? ` · ${roleLabel(profile.role)}` : ''}
            </p>
          </div>

          {device && (
            <div className="border-b border-gray-100">
              <p className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
                <ArrowLeftRight className="w-3 h-3" /> {t('accounts.switch')}
              </p>
              <AccountSwitchRow
                account={device}
                roleLabel={device.role ? roleLabel(device.role) : ''}
                needsPassword={switchNeedsPassword(profile?.role, device.role)}
              />
            </div>
          )}

          <button
            role="menuitem"
            onClick={() => { setOpen(false); accountSlots.addAccount() }}
            className="w-full text-left px-4 py-3 hover:bg-gray-50 transition flex items-start gap-3"
          >
            <UserPlus className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-gray-900">{t('accounts.add')}</span>
              <span className="block text-xs text-gray-500">{t('accounts.addHint')}</span>
            </span>
          </button>

          <button
            role="menuitem"
            onClick={signOut}
            className="w-full text-left px-4 py-3 border-t border-gray-100 hover:bg-red-50 transition flex items-center gap-3 text-red-600"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm font-medium">{t('nav.logout')}</span>
          </button>
        </div>
        </div>
      )}
    </div>
  )
}
