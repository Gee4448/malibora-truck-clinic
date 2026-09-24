import { useState } from 'react'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase, accountSlots } from '../../lib/supabase'
import { fromLoginEmail, verifyStaffPassword } from '../../lib/staffAccounts'
import { Lock } from 'lucide-react'

// The device account of this browser, offered to a tab that is on some other
// account (or on the login page). Clicking moves this tab onto it — straight
// away, or after that account's password when `needsPassword` (see
// switchNeedsPassword in src/lib/accountSlots.js).
export default function AccountSwitchRow({ account, needsPassword, roleLabel, onLoginPage = false, startOpen = false }) {
  const { t } = useLanguage()
  const [asking, setAsking] = useState(startOpen && needsPassword)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [wrong, setWrong] = useState(false)

  const name = account.name || fromLoginEmail(account.email)
  const detail = `${fromLoginEmail(account.email)}${roleLabel ? ` · ${roleLabel}` : ''}`

  // Leaving an added account in this tab: end its session here first, so it
  // is not left behind in the tab's storage.
  const moveOver = async () => {
    if (!accountSlots.isDeviceTab()) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    }
    accountSlots.switchToDevice()
  }

  const pick = () => {
    if (!needsPassword) return moveOver()
    setAsking(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!password) return
    setBusy(true)
    setWrong(false)
    const ok = await verifyStaffPassword(account.email, password)
    if (ok) return moveOver()
    setBusy(false)
    setWrong(true)
  }

  const shell = onLoginPage ? 'border border-gray-200 rounded-lg' : ''

  return (
    <div className={shell}>
      <button
        type="button"
        role={onLoginPage ? undefined : 'menuitem'}
        onClick={pick}
        aria-expanded={needsPassword ? asking : undefined}
        className={`w-full text-left flex items-center gap-3 hover:bg-gray-50 transition ${onLoginPage ? 'px-3 py-2 rounded-lg' : 'px-4 py-2.5'}`}
      >
        <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
          {name.trim().charAt(0).toUpperCase() || '?'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-gray-900 truncate">
            {onLoginPage ? t('accounts.continueAs', { name }) : t('accounts.backTo', { name })}
          </span>
          <span className="block text-xs text-gray-500 truncate">{detail}</span>
        </span>
        {needsPassword && (
          <Lock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" aria-label={t('accounts.needsPassword')} />
        )}
      </button>

      {asking && (
        <form onSubmit={submit} className={`space-y-2 ${onLoginPage ? 'px-3 pb-3' : 'px-4 pb-3'}`}>
          <label className="block text-xs text-gray-500">{t('accounts.passwordFor', { name })}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setWrong(false) }}
            autoFocus
            autoComplete="current-password"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
          {wrong && <p className="text-xs text-red-600">{t('accounts.wrongPassword')}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !password}
              className="flex-1 py-1.5 text-sm font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
              {busy ? t('common.loading') : t('accounts.continue')}
            </button>
            <button type="button" onClick={() => { setAsking(false); setPassword(''); setWrong(false) }}
              className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
