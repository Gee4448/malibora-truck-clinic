import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useClient } from '../../contexts/ClientAuthContext'
import {
  Truck, Globe, User, Building2, Phone, Mail, MapPin, Lock,
  ArrowRight, ArrowLeft, CheckCircle2, Clock, Plus, Eye, EyeOff
} from 'lucide-react'
import toast from 'react-hot-toast'
import { emptyVehicle } from '../../lib/vehicleOptions'
import VehicleFormBlock from '../../components/vehicles/VehicleFormBlock'

export default function ClientRegister() {
  const { t, locale, switchLanguage } = useLanguage()
  const { registerCustomer } = useClient()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [customerForm, setCustomerForm] = useState({
    full_name: '', company_name: '', phone: '', email: '', address: '', location: '',
    password: '', confirm_password: ''
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

  // Validates step-1 required fields and password rules. Used by both
  // "Submit (skip vehicle)" and "Add Vehicle" so we don't advance with
  // an incomplete profile.
  const validateStep1 = () => {
    if (!customerForm.full_name.trim() || !customerForm.phone.trim()) {
      toast.error(t('client.register.fillRequired'))
      return false
    }
    if (!customerForm.password || customerForm.password.length < 6) {
      toast.error(t('client.register.passwordTooShort'))
      return false
    }
    if (customerForm.password !== customerForm.confirm_password) {
      toast.error(t('client.register.passwordMismatch'))
      return false
    }
    return true
  }

  const submitRegistration = async (withVehicles) => {
    if (loading) return
    setLoading(true)
    try {
      let vehiclePayloads = []
      if (withVehicles) {
        const invalid = vehicles.some(v => !v.make.trim() || !v.registration_number.trim())
        if (invalid) {
          toast.error(t('client.register.fillRequired'))
          setLoading(false)
          return
        }
        // _customMake/_customModel/_customEngine are UI-only flags; registerCustomer
        // whitelists DB columns, so they are ignored downstream.
        vehiclePayloads = vehicles.map((v) => ({
          ...v,
          registration_number: v.registration_number.toUpperCase(),
          axles: v.axles ? parseInt(v.axles) : null,
        }))
      }

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

  const handleSkipVehicle = (e) => {
    e.preventDefault()
    if (!validateStep1()) return
    submitRegistration(false)
  }

  const handleAddVehicle = (e) => {
    e.preventDefault()
    if (!validateStep1()) return
    setStep(2)
  }

  const handleSubmitWithVehicle = (e) => {
    e.preventDefault()
    submitRegistration(true)
  }

  // Success "popup" — full-screen modal-style confirmation after registration.
  // Per product: new clients see a 24-hour acknowledgement and a clear path
  // back to the login screen where they can sign in once approved.
  if (success) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {t('client.register.requestReceivedTitle')}
          </h2>
          <p className="text-gray-600 text-sm mb-5 leading-relaxed">
            {t('client.register.requestReceivedMessage')}
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-5 flex items-center gap-2 justify-center">
            <Clock className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <p className="text-sm text-blue-700 font-medium">
              {t('client.register.withinTwentyFour')}
            </p>
          </div>
          <button
            onClick={() => navigate('/client')}
            className="w-full px-4 py-3 bg-blue-700 text-white font-medium rounded-xl hover:bg-blue-800 transition active:scale-[0.98]"
          >
            {t('client.register.backToLogin')}
          </button>
          <div className="mt-4 text-xs text-gray-400">
            {t('client.register.contactInfo')}{' '}
            <a href="tel:+255123456789" className="text-blue-600 font-medium">+255 123 456 789</a>
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
          <span className="text-xs font-medium">
            {t('client.register.stepVehicle')} <span className="opacity-70">({t('client.register.optional')})</span>
          </span>
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

              <form className="space-y-3.5">
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

                {/* Password */}
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                    <Lock className="w-3.5 h-3.5 text-gray-400" />
                    {t('client.register.passwordLabel')} *
                  </label>
                  <div className="relative">
                    <input
                      name="password"
                      value={customerForm.password}
                      onChange={handleCustomerChange}
                      type={showPassword ? 'text' : 'password'}
                      placeholder={t('client.register.passwordPlaceholder')}
                      className="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(s => !s)}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <FormInput icon={Lock} name="confirm_password" value={customerForm.confirm_password}
                  onChange={handleCustomerChange} label={t('client.register.confirmPasswordLabel')}
                  type={showPassword ? 'text' : 'password'} required />

                {/* Action buttons — submit without vehicles OR proceed to add one. */}
                <div className="pt-2 space-y-2.5">
                  <button
                    type="button"
                    onClick={handleSkipVehicle}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-700 text-white font-medium rounded-xl hover:bg-blue-800 transition disabled:opacity-40 active:scale-[0.98]"
                  >
                    {loading ? (
                      <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                      <>
                        {t('client.register.submitWithoutVehicle')}
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleAddVehicle}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-blue-200 bg-blue-50 text-blue-700 font-medium rounded-xl hover:bg-blue-100 transition disabled:opacity-40 active:scale-[0.98]"
                  >
                    <Plus className="w-4 h-4" />
                    {t('client.register.addVehicleOptional')}
                  </button>
                  <p className="text-xs text-gray-400 text-center pt-1">
                    {t('client.register.vehicleHint')}
                  </p>
                </div>
              </form>
            </>
          ) : (
            <>
              <div className="text-center mb-5">
                <h2 className="text-xl font-bold text-gray-900">{t('client.register.vehicleTitle')}</h2>
                <p className="text-gray-500 text-sm mt-1">{t('client.register.vehicleSubtitleOptional')}</p>
              </div>

              <form onSubmit={handleSubmitWithVehicle} className="space-y-3.5">
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
