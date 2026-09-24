import { useState } from 'react'
import { useLanguage } from '../../contexts/LanguageContext'
import { accountSlots } from '../../lib/supabase'
import { fromLoginEmail, verifyStaffPassword } from '../../lib/staffAccounts'
import { Lock } from 'lucide-react'

// One account that is open in another tab of this browser. Clicking moves
// this tab onto it — straight away, or after that account's password when
// `needsPassword` (see switchNeedsPassword in src/lib/accountSlots.js).
// Used by the header account menu and by the login page.
export default function AccountSwitchRow({ account, needsPassword, roleLabel, onLoginPage = false }) {
  const { t } = useLanguage()
  const [asking, setAsking] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [wrong, setWrong] = useState(false)

  const name = account.name || fromLoginEmail(account.email)
  const detail = `${fromLoginEmail(account.email)}${roleLabel ? ` · ${roleLabel}` : ''}`

  const pick = () => {
    if (!needsPassword) return accountSlots.switchTo(account.slot)
    setAsking(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!password) return
    setBusy(true)
    setWrong(false)
    const ok = await verifyStaffPassword(account.email, password)
    if (ok) {
      accountSlots.switchTo(account.slot)
      return
    }
    setBusy(false)
    setWrong(true)
  }

  const shell = onLoginPage
    ? 'border border-gray-200 rounded-lg'
    : ''

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
            {onLoginPage ? t('accounts.continueAs', { name }) : name}
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
