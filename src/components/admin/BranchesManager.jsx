import { useState, useEffect } from 'react'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase, errorMessage } from '../../lib/supabase'
import { MapPin, Plus, X, Power, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'

// The garage's locations (client request 5 Aug 2026: "add branch too — Iringa
// branch, wherever — it's better to know where a person works from"). Staff and
// mechanics are then each attached to one.
export default function BranchesManager() {
  const { t } = useLanguage()
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', location: '', phone: '' })

  const fetchBranches = async () => {
    const { data, error } = await supabase.from('branches').select('*').order('name')
    if (error) toast.error(errorMessage(error, t('branches.loadFailed')))
    setBranches(data || [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchBranches() }, [])

  const openAdd = () => { setEditing(null); setForm({ name: '', location: '', phone: '' }); setShowForm(true) }
  const openEdit = (b) => {
    setEditing(b)
    setForm({ name: b.name, location: b.location || '', phone: b.phone || '' })
    setShowForm(true)
  }

  const save = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error(t('branches.nameRequired'))
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        location: form.location.trim() || null,
        phone: form.phone.trim() || null,
      }
      const { error } = editing
        ? await supabase.from('branches').update(payload).eq('id', editing.id)
        : await supabase.from('branches').insert(payload)
      if (error) throw error
      toast.success(t('branches.saved'))
      setShowForm(false)
      fetchBranches()
    } catch (err) {
      toast.error(err.code === '23505'
        ? t('branches.duplicate')
        : errorMessage(err, t('branches.saveFailed')))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (b) => {
    try {
      const { error } = await supabase.from('branches').update({ active: !b.active }).eq('id', b.id)
      if (error) throw error
      fetchBranches()
    } catch (err) {
      toast.error(errorMessage(err, t('branches.saveFailed')))
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-blue-600" /> {t('branches.title')}
        </h2>
        <button onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 text-sm font-medium">
          <Plus className="w-4 h-4" /> {t('branches.add')}
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-4">{t('branches.hint')}</p>

      {loading ? (
        <div className="flex justify-center py-6"><div className="animate-spin w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>
      ) : branches.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">{t('branches.empty')}</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {branches.map((b) => (
            <div key={b.id} className="flex items-center gap-3 py-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${b.active ? 'bg-blue-100' : 'bg-gray-100'}`}>
                <MapPin className={`w-4 h-4 ${b.active ? 'text-blue-600' : 'text-gray-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${b.active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{b.name}</p>
                {(b.location || b.phone) && (
                  <p className="text-xs text-gray-500 truncate">{[b.location, b.phone].filter(Boolean).join(' · ')}</p>
                )}
              </div>
              {!b.active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{t('branches.inactive')}</span>}
              <button onClick={() => openEdit(b)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title={t('common.edit')}>
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => toggleActive(b)}
                className={`p-1.5 rounded hover:bg-gray-100 ${b.active ? 'text-red-500' : 'text-green-600'}`}
                title={b.active ? t('branches.deactivate') : t('branches.activate')}>
                <Power className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold">{editing ? t('branches.editTitle') : t('branches.addTitle')}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={save} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('branches.name')} *</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
                  placeholder={t('branches.namePlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('branches.location')}</label>
                <input type="text" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('branches.phone')}</label>
                <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-blue-700 text-white font-medium rounded-lg hover:bg-blue-800 transition disabled:opacity-50">
                  {saving ? t('common.loading') : t('common.save')}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition">
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
