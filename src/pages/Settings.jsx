import { useState } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Globe, User, Lock, Building, Save } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Settings() {
  const { t, locale, switchLanguage } = useLanguage()
  const { profile, user } = useAuth()
  const [profileForm, setProfileForm] = useState({
    full_name: profile?.full_name || '',
    phone: profile?.phone || '',
  })
  const [passwordForm, setPasswordForm] = useState({ password: '', confirmPassword: '' })
  const [saving, setSaving] = useState(false)

  const handleProfileUpdate = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { error } = await supabase.from('profiles').update(profileForm).eq('id', user.id)
      if (error) throw error
      toast.success(t('settings.profileUpdated'))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    if (passwordForm.password !== passwordForm.confirmPassword) {
      return toast.error(t('settings.passwordMismatch'))
    }
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordForm.password })
      if (error) throw error
      toast.success(t('settings.passwordUpdated'))
      setPasswordForm({ password: '', confirmPassword: '' })
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t('nav.settings')}</h1>

      {/* Language */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Globe className="w-5 h-5 text-blue-600" /> {t('settings.language')}
        </h2>
        <div className="flex gap-3">
          <button onClick={() => switchLanguage('en')}
            className={`flex-1 py-3 rounded-lg text-sm font-medium border-2 transition ${
              locale === 'en' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            English
          </button>
          <button onClick={() => switchLanguage('sw')}
            className={`flex-1 py-3 rounded-lg text-sm font-medium border-2 transition ${
              locale === 'sw' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            Kiswahili
          </button>
        </div>
      </div>

      {/* Profile */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <User className="w-5 h-5 text-blue-600" /> {t('settings.profile')}
        </h2>
        <form onSubmit={handleProfileUpdate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.fullName')}</label>
            <input type="text" value={profileForm.full_name} onChange={e => setProfileForm({...profileForm, full_name: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.phone')}</label>
            <input type="tel" value={profileForm.phone} onChange={e => setProfileForm({...profileForm, phone: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.email')}</label>
            <input type="email" value={user?.email || ''} disabled
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.role')}</label>
            <input type="text" value={profile?.role || ''} disabled
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 capitalize" />
          </div>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 text-sm font-medium disabled:opacity-50">
            <Save className="w-4 h-4" /> {t('common.save')}
          </button>
        </form>
      </div>

      {/* Password */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Lock className="w-5 h-5 text-blue-600" /> {t('settings.changePassword')}
        </h2>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.newPassword')}</label>
            <input type="password" value={passwordForm.password} onChange={e => setPasswordForm({...passwordForm, password: e.target.value})}
              required minLength={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.confirmNewPassword')}</label>
            <input type="password" value={passwordForm.confirmPassword} onChange={e => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
              required minLength={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 text-sm font-medium disabled:opacity-50">
            <Save className="w-4 h-4" /> {t('settings.updatePassword')}
          </button>
        </form>
      </div>

      {/* Business Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Building className="w-5 h-5 text-blue-600" /> {t('settings.businessInfo')}
        </h2>
        <div className="space-y-2 text-sm text-gray-600">
          <p><strong>{t('settings.business')}:</strong> Malibora Truck Clinic</p>
          <p><strong>{t('settings.location')}:</strong> Arusha, Tanzania</p>
          <p><strong>{t('settings.vatRate')}:</strong> 18%</p>
          <p><strong>{t('common.currency')}:</strong> TZS (Tanzania Shilling)</p>
        </div>
      </div>
    </div>
  )
}
