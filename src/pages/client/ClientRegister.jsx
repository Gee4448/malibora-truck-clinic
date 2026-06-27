import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useClient } from '../../contexts/ClientAuthContext'
import {
  Truck, Globe, User, Building2, Phone, Mail, MapPin,
  ArrowRight, ArrowLeft, CheckCircle2, Clock, Plus
} from 'lucide-react'
import toast from 'react-hot-toast'
import { emptyVehicle } from '../../lib/vehicleOptions'
import VehicleFormBlock from '../../components/vehicles/VehicleFormBlock'

export default function ClientRegister() {
  const { t, locale, switchLanguage } = useLanguage()
  const { registerCustomer } = useClient()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const [customerForm, setCustomerForm] = useState({
    full_name: '', company_name: '', phone: '', email: '', address: '', location: ''
  })

  const [vehicles, setVehicles] = useState([emptyVehicle()])

  const handleCustomerChange = (e) => {
    setCustomerForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const updateVehicle = (index, updates) => {
    setVehicles(prev => prev.map((v, i) => i === index ? { ...v, ...updates } : v))
  }

  const addVehicle = () => setVehicles(prev => [...prev, emptyVehicle()])

  const removeVehicle = (index) => {
    if (vehicles.length > 1) setVehicles(prev => prev.filter((_, i) => i !== index))
  }

  const goToStep2 = (e) => {
    e.preventDefault()
    if (!customerForm.full_name.trim() || !customerForm.phone.trim()) {
      toast.error(t('client.register.fillRequired'))
      return
    }
    setStep(2)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const invalid = vehicles.some(v => !v.make.trim() || !v.registration_number.trim())
    if (invalid) {
      toast.error(t('client.register.fillRequired'))
      return
    }

    setLoading(true)
    try {
      // _customMake/_customModel/_customEngine are UI-only flags; registerCustomer
      // whitelists DB columns, so they are ignored downstream.
      const vehiclePayloads = vehicles.map((v) => ({
        ...v,
        registration_number: v.registration_number.toUpperCase(),
        axles: v.axles ? parseInt(v.axles) : null,
      }))
      await registerCustomer(customerForm, vehiclePayloads)
      setSuccess(true)
    } catch (err) {
      toast.error(err.message === 'phone_exists'
        ? t('client.register.phoneExists')
        : t('client.register.error'))
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 flex flex-col">
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
        </div>

        <div className="flex-1 flex items-center justify-center px-4 pb-12">
          <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-sm text-center">
            <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {t('client.register.successTitle')}
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              {t('client.register.pendingMessage')}
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <p className="text-sm text-blue-700 font-medium">{t('client.register.contactInfo')}</p>
              <a href="tel:+255123456789" className="text-blue-600 font-bold text-lg">
                +255 123 456 789
              </a>
            </div>
            <Link
              to="/client"
              className="inline-flex items-center gap-2 text-blue-600 font-medium hover:text-blue-700"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('client.register.backToLogin')}
            </Link>
          </div>
        </div>
      </div>
    )
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

      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-3 px-4 py-2">
        <div className={`flex items-center gap-1.5 ${step >= 1 ? 'text-white' : 'text-blue-300'}`}>
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= 1 ? 'bg-white text-blue-700' : 'bg-white/20 text-blue-200'}`}>
            {step > 1 ? <CheckCircle2 className="w-4 h-4 text-blue-700" /> : '1'}
          </div>
          <span className="text-xs font-medium">{t('client.register.stepPersonal')}</span>
        </div>
        <div className={`w-8 h-0.5 ${step >= 2 ? 'bg-white' : 'bg-white/20'}`} />
        <div className={`flex items-center gap-1.5 ${step >= 2 ? 'text-white' : 'text-blue-300'}`}>
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= 2 ? 'bg-white text-blue-700' : 'bg-white/20 text-blue-200'}`}>
            2
          </div>
          <span className="text-xs font-medium">{t('client.register.stepVehicle')}</span>
        </div>
      </div>

      {/* Form Card */}
      <div className="flex-1 flex items-start justify-center px-4 pb-12 pt-2">
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-sm">
          {step === 1 ? (
            <>
              <div className="text-center mb-5">
                <h2 className="text-xl font-bold text-gray-900">{t('client.register.title')}</h2>
                <p className="text-gray-500 text-sm mt-1">{t('client.register.subtitle')}</p>
              </div>

              <form onSubmit={goToStep2} className="space-y-3.5">
                <FormInput icon={User} name="full_name" value={customerForm.full_name}
                  onChange={handleCustomerChange} label={t('client.register.nameLabel')} required />
                <FormInput icon={Building2} name="company_name" value={customerForm.company_name}
                  onChange={handleCustomerChange} label={t('client.register.companyLabel')} />
                <FormInput icon={Phone} name="phone" value={customerForm.phone}
                  onChange={handleCustomerChange} label={t('client.register.phoneLabel')}
                  type="tel" placeholder="0712 345 678" required />
                <FormInput icon={Mail} name="email" value={customerForm.email}
                  onChange={handleCustomerChange} label={t('client.register.emailLabel')} type="email" />
                <FormInput icon={MapPin} name="address" value={customerForm.address}
                  onChange={handleCustomerChange} label={t('client.register.addressLabel')} />
                <FormInput icon={MapPin} name="location" value={customerForm.location}
                  onChange={handleCustomerChange} label={t('client.register.locationLabel')}
                  placeholder={t('client.register.locationPlaceholder')} />

                <button type="submit"
                  className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-700 text-white font-medium rounded-xl hover:bg-blue-800 transition active:scale-[0.98]">
                  {t('client.register.next')}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="text-center mb-5">
                <h2 className="text-xl font-bold text-gray-900">{t('client.register.vehicleTitle')}</h2>
                <p className="text-gray-500 text-sm mt-1">{t('client.register.vehicleSubtitle')}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3.5">
                {vehicles.map((veh, idx) => (
                  <VehicleFormBlock
                    key={idx}
                    index={idx}
                    vehicle={veh}
                    total={vehicles.length}
                    updateVehicle={updateVehicle}
                    removeVehicle={removeVehicle}
                    t={t}
                  />
                ))}

                <button type="button" onClick={addVehicle}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-blue-300 text-blue-600 font-medium rounded-xl hover:bg-blue-50 transition active:scale-[0.98]">
                  <Plus className="w-4 h-4" />
                  {t('client.register.addAnotherVehicle')}
                </button>

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setStep(1)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition active:scale-[0.98]">
                    <ArrowLeft className="w-4 h-4" />
                    {t('common.back')}
                  </button>
                  <button type="submit" disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-700 text-white font-medium rounded-xl hover:bg-blue-800 transition disabled:opacity-40 active:scale-[0.98]">
                    {loading ? (
                      <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                      <>
                        {t('client.register.submit')}
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}

          <div className="mt-5 pt-4 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">{t('client.register.hasAccount')}</p>
            <Link to="/client" className="text-sm text-blue-600 font-medium hover:text-blue-700">
              {t('client.register.loginLink')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function FormInput({ icon: Icon, label, required, ...props }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-gray-400" />}
        {label} {required && '*'}
      </label>
      <input
        {...props}
        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
      />
    </div>
  )
}
