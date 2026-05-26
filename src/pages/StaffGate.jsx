import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase } from '../lib/supabase'
import { Shield, Eye, EyeOff, Globe, ArrowLeft, Lock } from 'lucide-react'
import toast from 'react-hot-toast'

export default function StaffGate() {
  const { t, locale, switchLanguage } = useLanguage()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [locked, setLocked] = useState(false)

  const MAX_ATTEMPTS = 5
  const LOCKOUT_SECONDS = 60

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (locked) {
      toast.error(t('staffGate.locked'))
      return
    }

    if (!code.trim()) return

    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('verify_staff_code', {
        input_code: code.trim()
      })

      if (error) throw error

      if (data === true) {
        // Store verification in sessionStorage (cleared on browser close)
        sessionStorage.setItem('malibora_staff_verified', 'true')
        sessionStorage.setItem('malibora_staff_verified_at', Date.now().toString())
        toast.success(t('staffGate.success'))
        navigate('/admin/login')
      } else {
        const newAttempts = attempts + 1
        setAttempts(newAttempts)
        setCode('')

        if (newAttempts >= MAX_ATTEMPTS) {
          setLocked(true)
          toast.error(t('staffGate.tooManyAttempts'))
          // Auto-unlock after lockout period
          setTimeout(() => {
            setLocked(false)
            setAttempts(0)
          }, LOCKOUT_SECONDS * 1000)
        } else {
          toast.error(
            `${t('staffGate.invalid')} (${MAX_ATTEMPTS - newAttempts} ${t('staffGate.attemptsLeft')})`
          )
        }
      }
    } catch (err) {
      console.error('Staff gate error:', err)
      toast.error(t('staffGate.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700 flex items-center justify-center p-4">
      {/* Language toggle */}
      <button
        onClick={() => switchLanguage(locale === 'en' ? 'sw' : 'en')}
        className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white/10 text-white hover:bg-white/20 transition-colors"
      >
        <Globe className="w-4 h-4" />
        {locale === 'en' ? 'Kiswahili' : 'English'}
      </button>

      {/* Back to home */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white/10 text-white hover:bg-white/20 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('common.back')}
      </button>

      <div className="w-full max-w-md">
        {/* Icon */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500 rounded-2xl shadow-lg mb-4">
            <Shield className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">{t('staffGate.title')}</h1>
          <p className="text-gray-300 text-sm mt-1">{t('staffGate.subtitle')}</p>
        </div>

        {/* Gate Form */}
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <Lock className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800">{t('staffGate.notice')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('staffGate.codeLabel')}
              </label>
              <div className="relative">
                <input
                  type={showCode ? 'text' : 'password'}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  disabled={locked}
                  required
                  maxLength={30}
                  autoComplete="off"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition pr-10 text-lg tracking-widest font-mono disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowCode(!showCode)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showCode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {locked && (
              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm text-red-700 font-medium">{t('staffGate.lockedMessage')}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || locked || !code.trim()}
              className="w-full py-3 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                  {t('common.loading')}
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  {t('staffGate.verify')}
                </>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-gray-400 mt-6">
            {t('staffGate.contactAdmin')}
          </p>
        </div>
      </div>
    </div>
  )
}
