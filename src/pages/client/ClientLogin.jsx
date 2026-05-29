import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useClient } from '../../contexts/ClientAuthContext'
import { Truck, Phone, ArrowRight, Globe, AlertCircle, Clock, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ClientLogin() {
  const { t, locale, switchLanguage } = useLanguage()
  const { loginWithPhone } = useClient()
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!phone.trim()) return

    setLoading(true)
    setError('')
    try {
      await loginWithPhone(phone.trim())
      toast.success(t('client.login.success'))
      navigate('/client/dashboard')
    } catch (err) {
      if (err.message === 'pending_approval') {
        setError('pending')
      } else if (err.message === 'rejected') {
        setError('rejected')
      } else {
        setError('not_found')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="bg-white rounded-xl p-2">
            <Truck className="w-6 h-6 text-blue-700" />
          </div>
          <div className="text-white">
            <h1 className="text-sm font-bold">{t('app.name')}</h1>
            <p className="text-blue-200 text-[10px]">{t('client.login.portal')}</p>
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

      {/* Login Card */}
      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Phone className="w-8 h-8 text-blue-700" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">{t('client.login.title')}</h2>
            <p className="text-gray-500 text-sm mt-1">{t('client.login.subtitle')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('client.login.phoneLabel')}
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setError('') }}
                placeholder={t('client.login.phonePlaceholder')}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 text-lg"
                autoFocus
              />
            </div>

            {error === 'pending' && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <Clock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">{t('client.login.statusPending')}</p>
                  <p className="text-xs text-amber-600 mt-1">{t('client.login.statusPendingHint')}</p>
                </div>
              </div>
            )}

            {error === 'rejected' && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">{t('client.login.statusRejected')}</p>
                  <p className="text-xs text-red-600 mt-1">{t('client.login.statusRejectedHint')}</p>
                </div>
              </div>
            )}

            {error === 'not_found' && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-700">{t('client.login.notFound')}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!phone.trim() || loading}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-700 text-white font-medium rounded-xl hover:bg-blue-800 transition disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {loading ? (
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <>
                  {t('client.login.button')}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-gray-100 text-center space-y-2">
            <div>
              <p className="text-xs text-gray-400">{t('client.login.noAccount')}</p>
              <Link to="/client/register" className="text-sm text-blue-600 font-medium hover:text-blue-700">
                {t('client.login.registerLink')}
              </Link>
            </div>
            <div>
              <a href="tel:+255123456789" className="text-xs text-gray-400 hover:text-gray-600">
                {t('client.login.callSupport')}
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Footer link to staff login */}
      <div className="text-center pb-6">
        <Link to="/admin/login" className="text-blue-200 text-xs hover:text-white transition-colors">
          {t('landing.staffLogin')}
        </Link>
      </div>
    </div>
  )
}
