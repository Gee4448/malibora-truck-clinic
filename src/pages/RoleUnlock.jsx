import { useState } from 'react'
import { useReveal } from '../hooks/useReveal'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase, isNetworkError } from '../lib/supabase'
import { KeyRound, Eye, EyeOff, ShieldCheck, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'

// Owner/manager access code. The caller is already signed in — redeeming a code
// only ever changes their own role (migration 018), it is not a second login.
export default function RoleUnlock() {
  // Entrance motion. `reveal` on this element, observed by the shared
  // IntersectionObserver in useReveal — the same one every other screen uses.
  const revealRef = useReveal()

  const { t } = useLanguage()
  const { profile, refreshProfile, canViewInternal } = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!code.trim()) return

    setLoading(true)
    try {
      const { data: grantedRole, error } = await supabase.rpc('redeem_role_code', {
        p_code: code.trim(),
      })
      if (error) throw error

      // Pull the new role into context so the sidebar and every canViewInternal
      // block update without signing out and back in.
      await refreshProfile()
      toast.success(`${t('roleUnlock.success')} ${grantedRole}`)
      navigate('/admin')
    } catch (err) {
      setCode('')
      const reason = err?.message || ''
      if (isNetworkError(err)) toast.error(t('staffGate.networkError'))
      else if (reason.includes('too_many_attempts')) toast.error(t('roleUnlock.tooManyAttempts'))
      else if (reason.includes('not_authenticated')) toast.error(t('roleUnlock.notAuthenticated'))
      else toast.error(t('roleUnlock.invalid'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div ref={revealRef} className="reveal-group max-w-md mx-auto space-y-4">
      <button onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> {t('common.back')}
      </button>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="inline-flex items-center justify-center w-10 h-10 bg-amber-100 rounded-xl">
            <KeyRound className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">{t('roleUnlock.title')}</h1>
            <p className="text-sm text-gray-500">{t('roleUnlock.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 my-5 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm">
          <span className="text-gray-500">{t('settings.role')}:</span>
          <span className="font-medium text-gray-900 capitalize">{profile?.role || '—'}</span>
          {canViewInternal && (
            <span className="ml-auto flex items-center gap-1 text-xs font-medium text-green-700">
              <ShieldCheck className="w-3.5 h-3.5" /> {t('roleUnlock.alreadyUnlocked')}
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('roleUnlock.codeLabel')}
            </label>
            <div className="relative">
              <input
                type={showCode ? 'text' : 'password'}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
                maxLength={40}
                autoComplete="off"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition pr-10 text-lg tracking-widest font-mono"
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShowCode(!showCode)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showCode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading || !code.trim()}
            className="w-full py-3 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                {t('common.loading')}
              </>
            ) : (
              <>
                <KeyRound className="w-4 h-4" /> {t('roleUnlock.submit')}
              </>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-5">{t('roleUnlock.hint')}</p>
      </div>
    </div>
  )
}
