import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useClient } from '../../contexts/ClientAuthContext'
import {
  Truck, Globe, User, Building2, Phone, Mail, MapPin,
  ArrowRight, ArrowLeft, CheckCircle2, Clock
} from 'lucide-react'
import toast from 'react-hot-toast'

const VEHICLE_TYPES = ['truck', 'trailer', 'car']
const FUEL_TYPES = ['diesel', 'petrol', 'electric', 'hybrid']

const TRUCK_MAKES = [
  'Scania', 'Volvo', 'DAF', 'MAN', 'Shacman', 'Mercedes-Benz', 'Iveco',
  'Renault Trucks', 'FAW', 'Hino', 'Isuzu', 'Mitsubishi Fuso',
  'Sinotruk', 'Dongfeng', 'Foton', 'JAC', 'Beiben', 'TATA',
]

const TRUCK_MODELS = {
  'Scania': [
    '93', '113', '143', '94', '114', '124', '144', '164',
    'P230', 'P310', 'P380', 'G420',
    'R420', 'R440', 'R480', 'R500', 'R560', 'R620', 'R650', 'R730', 'R770',
  ],
  'Volvo': ['FH16', 'FH12', 'FM12', 'FM440', 'FMX', 'VNL'],
  'DAF': ['XF', 'CF', 'LF', 'XG', 'XG+'],
  'MAN': ['TGX', 'TGS', 'TGM', 'TGL'],
  'Shacman': ['X3000', 'F3000', 'H3000', 'X6000'],
  'Mercedes-Benz': ['Actros', 'Axor', 'Atego', 'Arocs'],
  'Iveco': ['Stralis', 'Trakker', 'Eurocargo', 'S-Way'],
  'Renault Trucks': ['T', 'C', 'D', 'K', 'Master'],
  'FAW': ['J6P', 'J5K', 'JH6', 'J7'],
  'Hino': ['500 Series', '700 Series', '300 Series'],
  'Isuzu': ['FVZ', 'FRR', 'FSR', 'NQR', 'NPR', 'GIGA'],
  'Mitsubishi Fuso': ['Super Great', 'Fighter', 'Canter'],
  'Sinotruk': ['A7', 'T7H', 'T5G', 'ZZ3257', 'E7G'],
  'Dongfeng': ['KL', 'KX', 'KR', 'Captain'],
  'Foton': ['Auman', 'Aumark', 'Ollin'],
  'JAC': ['N-Series', 'K-Series', 'Gallop', 'Shuailing'],
  'Beiben': ['V3', 'V3ET', 'NG80', 'V3 ETX'],
  'TATA': ['Prima', 'LPT 1618', 'LPT 2518', 'Signa'],
}

const TRAILER_MAKES = ['BPW', 'ROR', 'SAF']

const TRAILER_MODELS = {
  'BPW': ['Flatbed', 'Tipper', 'Tanker', 'Lowbed', 'Skeletal', 'Side Curtain', 'Box Body'],
  'ROR': ['Flatbed', 'Tipper', 'Tanker', 'Lowbed', 'Skeletal', 'Side Curtain', 'Box Body'],
  'SAF': ['Flatbed', 'Tipper', 'Tanker', 'Lowbed', 'Skeletal', 'Side Curtain', 'Box Body'],
}

const getMakes = (type) => type === 'trailer' ? TRAILER_MAKES : TRUCK_MAKES
const getModels = (type) => type === 'trailer' ? TRAILER_MODELS : TRUCK_MODELS

const ENGINE_TYPES = [
  'Diesel Turbo', 'Diesel', 'Diesel Intercooler',
  'Petrol', 'CNG', 'LPG',
]

const AXLE_OPTIONS = [
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
  { value: '6', label: '6+' },
]

export default function ClientRegister() {
  const { t, locale, switchLanguage } = useLanguage()
  const { registerCustomer } = useClient()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [customMake, setCustomMake] = useState(false)
  const [customModel, setCustomModel] = useState(false)
  const [customEngine, setCustomEngine] = useState(false)

  const [customerForm, setCustomerForm] = useState({
    full_name: '', company_name: '', phone: '', email: '', address: '', location: ''
  })

  const [vehicleForm, setVehicleForm] = useState({
    vehicle_type: 'truck', make: '', model: '', registration_number: '',
    engine_type: '', chassis_number: '', axles: '', fuel_type: 'diesel'
  })

  const handleCustomerChange = (e) => {
    setCustomerForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleVehicleChange = (e) => {
    setVehicleForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
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
    if (!vehicleForm.make.trim() || !vehicleForm.registration_number.trim()) {
      toast.error(t('client.register.fillRequired'))
      return
    }

    setLoading(true)
    try {
      await registerCustomer(customerForm, {
        ...vehicleForm,
        registration_number: vehicleForm.registration_number.toUpperCase(),
        axles: vehicleForm.axles ? parseInt(vehicleForm.axles) : null,
      })
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('client.register.vehicleType')} *
                  </label>
                  <select name="vehicle_type" value={vehicleForm.vehicle_type} onChange={(e) => {
                      setVehicleForm(prev => ({ ...prev, vehicle_type: e.target.value, make: '', model: '' }));
                      setCustomMake(false); setCustomModel(false);
                    }}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 bg-white">
                    {VEHICLE_TYPES.map(type => (
                      <option key={type} value={type}>{t(`client.register.types.${type}`)}</option>
                    ))}
                  </select>
                </div>

                {/* Make / Brand */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('client.register.makeLabel')} *
                  </label>
                  {customMake ? (
                    <div className="flex gap-2">
                      <input name="make" value={vehicleForm.make} onChange={handleVehicleChange} required
                        placeholder={t('client.register.typeMake')}
                        className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900" />
                      <button type="button" onClick={() => { setCustomMake(false); setVehicleForm(prev => ({...prev, make: '', model: ''})); setCustomModel(false) }}
                        className="px-3 py-2 text-xs border border-gray-300 rounded-xl hover:bg-gray-50 text-gray-500">{t('client.register.backToList')}</button>
                    </div>
                  ) : (
                    <select name="make" value={vehicleForm.make} onChange={(e) => {
                      if (e.target.value === '__other__') { setCustomMake(true); setVehicleForm(prev => ({...prev, make: '', model: ''})); setCustomModel(true); }
                      else { handleVehicleChange(e); setVehicleForm(prev => ({...prev, model: ''})); setCustomModel(false); }
                    }} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 bg-white">
                      <option value="">{t('client.register.selectMake')}</option>
                      {getMakes(vehicleForm.vehicle_type).map(m => <option key={m} value={m}>{m}</option>)}
                      <option value="__other__">{t('client.register.otherMake')}</option>
                    </select>
                  )}
                </div>

                {/* Model */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('client.register.modelLabel')}
                  </label>
                  {customModel || customMake || !getModels(vehicleForm.vehicle_type)[vehicleForm.make] ? (
                    <input name="model" value={vehicleForm.model} onChange={handleVehicleChange}
                      placeholder={t('client.register.typeModel')}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900" />
                  ) : (
                    <select name="model" value={vehicleForm.model} onChange={(e) => {
                      if (e.target.value === '__other__') { setCustomModel(true); setVehicleForm(prev => ({...prev, model: ''})); }
                      else handleVehicleChange(e);
                    }} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 bg-white">
                      <option value="">{t('client.register.selectModel')}</option>
                      {(getModels(vehicleForm.vehicle_type)[vehicleForm.make] || []).map(m => <option key={m} value={m}>{m}</option>)}
                      <option value="__other__">{t('client.register.otherModel')}</option>
                    </select>
                  )}
                </div>

                <FormInput name="registration_number" value={vehicleForm.registration_number}
                  onChange={handleVehicleChange} label={t('client.register.plateLabel')} required
                  placeholder="e.g. T 123 ABC" style={{ textTransform: 'uppercase' }} />

                {/* Engine Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('client.register.engineTypeLabel')}
                  </label>
                  {customEngine ? (
                    <div className="flex gap-2">
                      <input name="engine_type" value={vehicleForm.engine_type} onChange={handleVehicleChange}
                        placeholder={t('client.register.typeEngine')}
                        className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900" />
                      <button type="button" onClick={() => { setCustomEngine(false); setVehicleForm(prev => ({...prev, engine_type: ''})) }}
                        className="px-3 py-2 text-xs border border-gray-300 rounded-xl hover:bg-gray-50 text-gray-500">{t('client.register.backToList')}</button>
                    </div>
                  ) : (
                    <select name="engine_type" value={vehicleForm.engine_type} onChange={(e) => {
                      if (e.target.value === '__other__') { setCustomEngine(true); setVehicleForm(prev => ({...prev, engine_type: ''})); }
                      else handleVehicleChange(e);
                    }} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 bg-white">
                      <option value="">{t('client.register.selectEngine')}</option>
                      {ENGINE_TYPES.map(e => <option key={e} value={e}>{e}</option>)}
                      <option value="__other__">{t('client.register.otherEngine')}</option>
                    </select>
                  )}
                </div>

                <FormInput name="chassis_number" value={vehicleForm.chassis_number}
                  onChange={handleVehicleChange} label={t('client.register.chassisLabel')} />

                {/* Number of Axles */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('client.register.axlesLabel')}
                  </label>
                  <select name="axles" value={vehicleForm.axles} onChange={handleVehicleChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 bg-white">
                    <option value="">{t('client.register.selectAxles')}</option>
                    {AXLE_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('client.register.fuelTypeLabel')}
                  </label>
                  <select name="fuel_type" value={vehicleForm.fuel_type} onChange={handleVehicleChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 bg-white">
                    {FUEL_TYPES.map(type => (
                      <option key={type} value={type}>{t(`client.register.fuels.${type}`)}</option>
                    ))}
                  </select>
                </div>

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
