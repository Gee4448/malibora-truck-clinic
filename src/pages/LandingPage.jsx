import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import {
  Truck, ClipboardCheck, Wrench, FileText, Shield,
  Phone, MapPin, Clock, Globe, Search, ArrowRight, CheckCircle2
} from 'lucide-react'

export default function LandingPage() {
  const { t, locale, switchLanguage } = useLanguage()
  const navigate = useNavigate()
  const [trackingId, setTrackingId] = useState('')

  const handleTrack = (e) => {
    e.preventDefault()
    if (trackingId.trim()) {
      navigate(`/c/${trackingId.trim()}`)
    }
  }

  const services = [
    { icon: ClipboardCheck, titleKey: 'landing.services.inspection', descKey: 'landing.services.inspectionDesc' },
    { icon: Wrench, titleKey: 'landing.services.repair', descKey: 'landing.services.repairDesc' },
    { icon: FileText, titleKey: 'landing.services.diagnostics', descKey: 'landing.services.diagnosticsDesc' },
    { icon: Shield, titleKey: 'landing.services.maintenance', descKey: 'landing.services.maintenanceDesc' },
  ]

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-blue-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-xl p-2">
              <Truck className="w-7 h-7 text-blue-700" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">{t('app.name')}</h1>
              <p className="text-blue-200 text-xs">{t('app.tagline')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => switchLanguage(locale === 'en' ? 'sw' : 'en')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white/10 hover:bg-white/20 transition-colors"
            >
              <Globe className="w-4 h-4" />
              {locale === 'en' ? 'SW' : 'EN'}
            </button>
            <Link
              to="/client"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-white text-blue-900 hover:bg-blue-50 transition-colors"
            >
              {t('landing.clientPortal')}
            </Link>
            <Link
              to="/admin/gate"
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              {t('landing.staffLogin')}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 text-white py-16 sm:py-24">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-5xl font-bold mb-4 leading-tight">
            {t('landing.hero.title')}
          </h2>
          <p className="text-blue-200 text-lg sm:text-xl mb-10 max-w-2xl mx-auto">
            {t('landing.hero.subtitle')}
          </p>

          {/* Vehicle Tracking Form */}
          <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-lg mx-auto">
            <div className="flex items-center gap-2 mb-4">
              <Search className="w-5 h-5 text-blue-700" />
              <h3 className="text-lg font-bold text-gray-900">{t('landing.track.title')}</h3>
            </div>
            <p className="text-gray-500 text-sm mb-4">{t('landing.track.subtitle')}</p>
            <form onSubmit={handleTrack} className="flex gap-2">
              <input
                type="text"
                value={trackingId}
                onChange={(e) => setTrackingId(e.target.value)}
                placeholder={t('landing.track.placeholder')}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
              />
              <button
                type="submit"
                disabled={!trackingId.trim()}
                className="px-6 py-3 bg-blue-700 text-white font-medium rounded-lg hover:bg-blue-800 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {t('landing.track.button')}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4">
          <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-3">
            {t('landing.services.title')}
          </h3>
          <p className="text-gray-500 text-center mb-12 max-w-xl mx-auto">
            {t('landing.services.subtitle')}
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {services.map((svc) => (
              <div key={svc.titleKey} className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                  <svc.icon className="w-6 h-6 text-blue-700" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">{t(svc.titleKey)}</h4>
                <p className="text-gray-500 text-sm">{t(svc.descKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-12">
            {t('landing.why.title')}
          </h3>
          <div className="grid sm:grid-cols-3 gap-8">
            {['experienced', 'transparent', 'fast'].map((key) => (
              <div key={key} className="text-center">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-7 h-7 text-green-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">{t(`landing.why.${key}`)}</h4>
                <p className="text-gray-500 text-sm">{t(`landing.why.${key}Desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact / Footer */}
      <footer className="bg-blue-900 text-white py-12">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid sm:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Truck className="w-6 h-6" />
                <span className="font-bold text-lg">{t('app.name')}</span>
              </div>
              <p className="text-blue-200 text-sm">{t('landing.footer.description')}</p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">{t('landing.footer.contact')}</h4>
              <div className="space-y-3 text-blue-200 text-sm">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  <span>+255 XXX XXX XXX</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>Dar es Salaam, Tanzania</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>{t('landing.footer.hours')}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-4">{t('landing.footer.quickLinks')}</h4>
              <div className="space-y-2 text-blue-200 text-sm">
                <Link to="/client" className="block hover:text-white transition-colors">
                  {t('landing.clientPortal')}
                </Link>
                <Link to="/admin/gate" className="block hover:text-white transition-colors">
                  {t('landing.staffLogin')}
                </Link>
              </div>
            </div>
          </div>
          <div className="border-t border-blue-800 pt-6 text-center text-blue-300 text-sm">
            {t('landing.footer.copyright')}
          </div>
        </div>
      </footer>
    </div>
  )
}
