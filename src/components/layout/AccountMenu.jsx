import { useState, useRef, useEffect } from 'react'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase, accountSlots } from '../../lib/supabase'
import { fromLoginEmail } from '../../lib/staffAccounts'
import { switchNeedsPassword } from '../../lib/accountSlots'
import AccountSwitchRow from '../common/AccountSwitchRow'
import { ChevronDown, LogOut, UserPlus, ArrowLeftRight } from 'lucide-react'

// The avatar in the app bar, and the menu it opens: who this tab is signed in
// as, every other account signed in on this browser (one click switches this
// tab to it), add another account, sign out. Tabs keep their own account, so
// the owner can have a receptionist's screen and his own open side by side
// (see src/lib/accountSlots.js).
export default function AccountMenu() {
  const { t } = useLanguage()
  const { user, profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [others, setOthers] = useState([])
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // The other logins on this browser. Read when the menu opens, not on every
  // render: they only change through this menu or the login page, both of
  // which reload the tab.
  const otherLogins = () => {
    const mine = accountSlots.currentSlot()
    return accountSlots.listAccounts().filter(a => a.slot !== mine)
  }

  const toggle = () => {
    if (!open) setOthers(otherLogins())
    setOpen(!open)
  }

  // The stored session only knows what sign-up recorded; the roster has the
  // current name and role. profiles is readable by any signed-in staff.
  useEffect(() => {
    if (!open) return
    const stored = otherLogins()
    if (stored.length === 0) return
    let cancelled = false
    supabase.from('profiles').select('id, full_name, role')
      .in('id', stored.map(a => a.userId))
      .then(({ data }) => {
        if (cancelled || !data) return
        const byId = Object.fromEntries(data.map(p => [p.id, p]))
        setOthers(stored.map(a => ({
          ...a,
          name: byId[a.userId]?.full_name || a.name,
          role: byId[a.userId]?.role || null,
        })))
      })
    return () => { cancelled = true }
  }, [open])

  const addAccount = () => {
    // Someone already signed in as staff has proven they are staff, so the
    // access-code gate (StaffGate.jsx) need not be passed again in this tab.
    sessionStorage.setItem('malibora_staff_verified', 'true')
    sessionStorage.setItem('malibora_staff_verified_at', Date.now().toString())
    accountSlots.addAccount()
  }

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

          {others.length > 0 && (
            <div className="border-b border-gray-100">
              <p className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
                <ArrowLeftRight className="w-3 h-3" /> {t('accounts.switch')}
              </p>
              {others.map((a) => (
                <AccountSwitchRow
                  key={a.slot}
                  account={a}
                  roleLabel={a.role ? roleLabel(a.role) : ''}
                  needsPassword={switchNeedsPassword(profile?.role, a.role)}
                />
              ))}
            </div>
          )}

          <button
            role="menuitem"
            onClick={addAccount}
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
