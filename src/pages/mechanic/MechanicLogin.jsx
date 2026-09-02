import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useMechanic } from '../../contexts/MechanicAuthContext'
import { isNetworkError } from '../../lib/supabase'
import { Wrench, Globe, ArrowRight, AlertCircle, WifiOff, Delete } from 'lucide-react'
import toast from 'react-hot-toast'

export default function MechanicLogin() {
  const { t, locale, switchLanguage } = useLanguage()
  const { loginWithPin } = useMechanic()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (value) => {
    if (loading || !value.trim()) return
    setLoading(true)
    setError('')
    try {
      await loginWithPin(value)
      toast.success(t('mechanic.login.success'))
      navigate('/mechanic/jobs')
    } catch (err) {
      setError(isNetworkError(err) ? 'connection' : 'invalid')
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  const press = (digit) => {
    if (code.length >= 8) return
    const next = code + digit
    setCode(next)
    setError('')
  }
  const backspace = () => { setCode((c) => c.slice(0, -1)); setError('') }

  return (
    <div className="min-h-screen auth-stage flex flex-col">
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="bg-amber-500 rounded-xl p-2">
            <Wrench className="w-6 h-6 text-white" />
          </div>
          <div className="text-white">
            <h1 className="text-sm font-bold">{t('app.name')}</h1>
            <p className="text-slate-300 text-[10px]">{t('mechanic.login.portal')}</p>
          </div>
        </div>
        <button
          onClick={() => switchLanguage(locale === 'en' ? 'sw' : 'en')}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-white/10 hover:bg-white/20 transition-colors"
        >
          <Globe className="w-4 h-4" />
          {locale === 'en' ? 'Kiswahili' : 'English'}
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="auth-card rounded-2xl p-6 sm:p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Wrench className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">{t('mechanic.login.title')}</h2>
            <p className="text-gray-500 text-sm mt-1">{t('mechanic.login.subtitle')}</p>
          </div>

          {/* PIN display */}
          <div className="flex items-center justify-center gap-2 mb-5 h-12">
            {code.length === 0
              ? <span className="text-gray-500 text-sm">{t('mechanic.login.enterPin')}</span>
              : code.split('').map((_, i) => (
                  <div key={i} className="w-4 h-4 rounded-full bg-blue-500" />
                ))}
          </div>

          {error === 'invalid' && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{t('mechanic.login.invalid')}</p>
            </div>
          )}
          {error === 'connection' && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-orange-50 border border-orange-200 rounded-xl">
              <WifiOff className="w-4 h-4 text-orange-500 flex-shrink-0" />
              <p className="text-sm text-orange-700">{t('mechanic.login.connectionError')}</p>
            </div>
          )}

          {/* Numeric keypad */}
          <div className="grid grid-cols-3 gap-3">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button
                key={d}
                onClick={() => press(d)}
                className="py-4 text-xl font-bold text-gray-800 bg-gray-100 rounded-xl hover:bg-gray-200 active:scale-95 transition"
              >
                {d}
              </button>
            ))}
            <button onClick={backspace}
              className="py-4 flex items-center justify-center text-gray-500 bg-gray-100 rounded-xl hover:bg-gray-200 active:scale-95 transition">
              <Delete className="w-6 h-6" />
            </button>
            <button onClick={() => press('0')}
              className="py-4 text-xl font-bold text-gray-800 bg-gray-100 rounded-xl hover:bg-gray-200 active:scale-95 transition">
              0
            </button>
            <button
              onClick={() => submit(code)}
              disabled={loading || !code.trim()}
              className="py-4 flex items-center justify-center bg-amber-600 text-white rounded-xl hover:bg-amber-700 active:scale-95 transition disabled:opacity-40"
            >
              {loading ? (
                <div className="animate-spin w-6 h-6 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <ArrowRight className="w-6 h-6" />
              )}
            </button>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100 text-center">
            <Link to="/client" className="text-xs text-gray-500 hover:text-gray-700">
              {t('mechanic.login.notMechanic')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
