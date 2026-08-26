import { useState, useEffect } from 'react'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase, errorMessage } from '../../lib/supabase'
import { Wrench, Plus, X, Power, KeyRound, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'

// Owner/manager tool to add mechanics and set their portal PIN. PINs are never
// read back (hashed server-side) — leave the PIN field blank when editing to
// keep the existing one.
export default function MechanicsManager() {
  const { t } = useLanguage()
  const [mechanics, setMechanics] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)
  const [branches, setBranches] = useState([])
  const [form, setForm] = useState({ name: '', phone: '', pin: '', branch_id: '' })

  useEffect(() => { fetchMechanics() }, [])

  const fetchMechanics = async () => {
    try {
      const [mechRes, branchRes] = await Promise.all([
        supabase.from('mechanics').select('id, name, phone, active, branch_id, branches(name)').order('name'),
        supabase.from('branches').select('id, name').eq('active', true).order('name'),
      ])
      setMechanics(mechRes.data || [])
      setBranches(branchRes.data || [])
    } catch (err) {
      console.error('Mechanics load error:', err)
    } finally {
      setLoading(false)
    }
  }

  const openAdd = () => { setEditing(null); setForm({ name: '', phone: '', pin: '', branch_id: '' }); setShowForm(true) }
  const openEdit = (m) => {
    setEditing(m)
    setForm({ name: m.name, phone: m.phone || '', pin: '', branch_id: m.branch_id || '' })
    setShowForm(true)
  }

  const save = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error(t('mechanicsAdmin.nameRequired'))
    if (!editing && form.pin.trim().length < 4) return toast.error(t('mechanicsAdmin.pinTooShort'))
    setSaving(true)
    try {
      const { error } = await supabase.rpc('admin_save_mechanic', {
        p_id: editing?.id || null,
        p_name: form.name.trim(),
        p_phone: form.phone.trim(),
        p_code: form.pin.trim(),
        p_active: editing ? editing.active : true,
        p_branch_id: form.branch_id || null,
      })
      if (error) throw error
      toast.success(t('mechanicsAdmin.saved'))
      setShowForm(false)
      fetchMechanics()
    } catch (err) {
      toast.error(err.message?.includes('forbidden')
        ? t('mechanicsAdmin.forbidden')
        : errorMessage(err, t('mechanicsAdmin.saveFailed')))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (m) => {
    try {
      const { error } = await supabase.rpc('admin_save_mechanic', {
        p_id: m.id, p_name: m.name, p_phone: m.phone || '', p_code: '', p_active: !m.active,
        p_branch_id: m.branch_id || null,
      })
      if (error) throw error
      fetchMechanics()
    } catch (err) {
      toast.error(errorMessage(err, t('mechanicsAdmin.saveFailed')))
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Wrench className="w-5 h-5 text-blue-600" /> {t('mechanicsAdmin.title')}
        </h2>
        <button onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 text-sm font-medium">
          <Plus className="w-4 h-4" /> {t('mechanicsAdmin.add')}
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-4">{t('mechanicsAdmin.hint')}</p>

      {loading ? (
        <div className="flex justify-center py-6"><div className="animate-spin w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>
      ) : mechanics.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">{t('mechanicsAdmin.empty')}</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {mechanics.map((m) => (
            <div key={m.id} className="flex items-center gap-3 py-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${m.active ? 'bg-amber-100' : 'bg-gray-100'}`}>
                <Wrench className={`w-4 h-4 ${m.active ? 'text-amber-600' : 'text-gray-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${m.active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{m.name}</p>
                {(m.phone || m.branches?.name) && (
                  <p className="text-xs text-gray-500 truncate">
                    {[m.phone, m.branches?.name].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              {!m.active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{t('mechanicsAdmin.inactive')}</span>}
              <button onClick={() => openEdit(m)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title={t('common.edit')}>
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => toggleActive(m)}
                className={`p-1.5 rounded hover:bg-gray-100 ${m.active ? 'text-red-500' : 'text-green-600'}`}
                title={m.active ? t('mechanicsAdmin.deactivate') : t('mechanicsAdmin.activate')}>
                <Power className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 glass-overlay z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm modal-card">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold">{editing ? t('mechanicsAdmin.editTitle') : t('mechanicsAdmin.addTitle')}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={save} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('mechanicsAdmin.name')} *</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('mechanicsAdmin.phone')}</label>
                <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('mechanicsAdmin.branch')}</label>
                <select value={form.branch_id} onChange={e => setForm({ ...form, branch_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                  <option value="">{t('mechanicsAdmin.noBranch')}</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
                  <KeyRound className="w-3.5 h-3.5 text-gray-400" />
                  {t('mechanicsAdmin.pin')} {editing ? '' : '*'}
                </label>
                <input type="text" inputMode="numeric" value={form.pin} onChange={e => setForm({ ...form, pin: e.target.value })}
                  placeholder={editing ? t('mechanicsAdmin.pinKeep') : t('mechanicsAdmin.pinPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none tracking-widest font-mono" />
                <p className="text-xs text-gray-400 mt-1">{t('mechanicsAdmin.pinHint')}</p>
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
