import { useState, useEffect } from 'react'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import { CreditCard, Plus, Trash2, X, Save, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'

const EMPTY = {
  channel_type: 'mobile_money',
  label: '',
  account_name: '',
  account_number: '',
  instructions: '',
  is_active: true,
}

// Owner/manager screen for the accounts customers are told to pay into
// (migration 023). Whatever is switched on here is what the portal shows on
// the invoice and inspection-fee payment screens.
export default function PaymentChannelsManager() {
  const { t } = useLanguage()
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchChannels() }, [])

  const fetchChannels = async () => {
    const { data, error } = await supabase
      .from('payment_channels')
      .select('*')
      .order('sort_order')
    if (error) toast.error(error.message)
    setChannels(data || [])
    setLoading(false)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.label.trim()) { toast.error(t('payments.needLabel')); return }
    setSaving(true)
    try {
      const payload = {
        channel_type: form.channel_type,
        label: form.label.trim(),
        account_name: form.account_name.trim() || null,
        account_number: form.account_number.trim() || null,
        instructions: form.instructions.trim() || null,
        is_active: form.is_active,
        sort_order: channels.length,
      }
      const { error } = await supabase.from('payment_channels').insert(payload)
      if (error) throw error
      toast.success(t('payments.saved'))
      setForm(EMPTY)
      setShowForm(false)
      fetchChannels()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (channel) => {
    const { data, error } = await supabase
      .from('payment_channels')
      .update({ is_active: !channel.is_active })
      .eq('id', channel.id)
      .select('id')
    if (error) return toast.error(error.message)
    // A blocked write returns error = null and zero rows — check the count or
    // the UI reports a success that never happened (see migration 019).
    if (!data || data.length === 0) return toast.error(t('payments.saveFailed'))
    fetchChannels()
  }

  const remove = async (channel) => {
    if (!confirm(t('payments.deleteConfirm'))) return
    const { data, error } = await supabase
      .from('payment_channels')
      .delete()
      .eq('id', channel.id)
      .select('id')
    if (error) return toast.error(error.message)
    if (!data || data.length === 0) return toast.error(t('payments.deleteFailed'))
    toast.success(t('payments.deleted'))
    fetchChannels()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-blue-600" /> {t('payments.title')}
        </h2>
        <button
          onClick={() => { setForm(EMPTY); setShowForm(true) }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 text-white rounded-lg hover:bg-blue-800 text-sm font-medium cursor-pointer"
        >
          <Plus className="w-4 h-4" /> {t('common.add')}
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-4">{t('payments.hint')}</p>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : channels.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">{t('payments.none')}</p>
      ) : (
        <div className="space-y-2">
          {channels.map((c) => (
            <div
              key={c.id}
              className={`flex items-start gap-3 rounded-xl border p-3 ${
                c.is_active ? 'border-gray-200' : 'border-gray-200 bg-gray-50 opacity-60'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900">{c.label}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {t(`payments.types.${c.channel_type}`)}
                  </span>
                </div>
                {c.account_name && <p className="text-xs text-gray-500">{c.account_name}</p>}
                {c.account_number && <p className="text-sm font-mono text-gray-800 break-all">{c.account_number}</p>}
                {c.instructions && <p className="text-xs text-gray-400 mt-0.5">{c.instructions}</p>}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => toggleActive(c)}
                  title={c.is_active ? t('payments.hideFromCustomers') : t('payments.showToCustomers')}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer"
                >
                  {c.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => remove(c)}
                  className="p-2 rounded-lg hover:bg-red-50 text-red-500 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-bold">{t('payments.addChannel')}</h3>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.channelType')}</label>
                <select
                  value={form.channel_type}
                  onChange={e => setForm({ ...form, channel_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                >
                  <option value="mobile_money">{t('payments.types.mobile_money')}</option>
                  <option value="bank">{t('payments.types.bank')}</option>
                  <option value="cash">{t('payments.types.cash')}</option>
                  <option value="other">{t('payments.types.other')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.label')} *</label>
                <input
                  type="text" value={form.label} required
                  onChange={e => setForm({ ...form, label: e.target.value })}
                  placeholder={t('payments.labelPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.accountName')}</label>
                <input
                  type="text" value={form.account_name}
                  onChange={e => setForm({ ...form, account_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.accountNumber')}</label>
                <input
                  type="text" value={form.account_number}
                  onChange={e => setForm({ ...form, account_number: e.target.value })}
                  placeholder={t('payments.accountNumberPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.instructions')}</label>
                <textarea
                  value={form.instructions} rows={2}
                  onChange={e => setForm({ ...form, instructions: e.target.value })}
                  placeholder={t('payments.instructionsPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit" disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-700 text-white font-medium rounded-lg hover:bg-blue-800 transition disabled:opacity-40 cursor-pointer"
                >
                  <Save className="w-4 h-4" /> {t('common.save')}
                </button>
                <button
                  type="button" onClick={() => setShowForm(false)}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
