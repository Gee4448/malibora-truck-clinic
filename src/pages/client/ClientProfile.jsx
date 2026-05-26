import { useState } from 'react'
import { useLanguage } from '../../contexts/LanguageContext'
import { useClient } from '../../contexts/ClientAuthContext'
import { supabase } from '../../lib/supabase'
import { User, Phone, Building2, MapPin, Mail, Save } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ClientProfile() {
  const { t } = useLanguage()
  const { customer, refreshCustomer } = useClient()
  const [form, setForm] = useState({
    full_name: customer?.full_name || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    company: customer?.company || '',
    address: customer?.address || '',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('customers')
        .update({
          full_name: form.full_name,
          phone: form.phone,
          email: form.email,
          company: form.company,
          address: form.address,
        })
        .eq('id', customer.id)

      if (error) throw error
      await refreshCustomer(customer.id)
      toast.success(t('client.profile.updated'))
    } catch (err) {
      toast.error(t('client.profile.updateError'))
    } finally {
      setSaving(false)
    }
  }

  const fields = [
    { key: 'full_name', icon: User, label: t('client.profile.name'), type: 'text' },
    { key: 'phone', icon: Phone, label: t('client.profile.phone'), type: 'tel' },
    { key: 'email', icon: Mail, label: t('client.profile.email'), type: 'email' },
    { key: 'company', icon: Building2, label: t('client.profile.company'), type: 'text' },
    { key: 'address', icon: MapPin, label: t('client.profile.address'), type: 'text' },
  ]

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-gray-900">{t('client.profile.title')}</h1>

      {/* Avatar */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <span className="text-2xl font-bold text-blue-700">
            {customer?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </span>
        </div>
        <h2 className="text-lg font-bold text-gray-900">{customer?.full_name}</h2>
        {customer?.company && <p className="text-sm text-gray-500">{customer.company}</p>}
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        {fields.map((field) => (
          <div key={field.key}>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <field.icon className="w-4 h-4 text-gray-400" />
              {field.label}
            </label>
            <input
              type={field.type}
              value={form[field.key]}
              onChange={(e) => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
            />
          </div>
        ))}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-700 text-white font-medium rounded-xl hover:bg-blue-800 transition disabled:opacity-50 active:scale-[0.98]"
        >
          {saving ? (
            <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <>
              <Save className="w-4 h-4" />
              {t('client.profile.save')}
            </>
          )}
        </button>
      </div>

      {/* Customer ID */}
      {customer?.id && (
        <p className="text-center text-[10px] text-gray-300">ID: {customer.id.slice(0, 8)}</p>
      )}
    </div>
  )
}
