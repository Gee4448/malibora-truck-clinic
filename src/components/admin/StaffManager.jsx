import { useState, useEffect } from 'react'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase, errorMessage } from '../../lib/supabase'
import { createStaffAccount, updateStaffProfile, fromLoginEmail, ROLES } from '../../lib/staffAccounts'
import { Users, Plus, X, Power, Pencil, Eye, EyeOff, AtSign } from 'lucide-react'
import toast from 'react-hot-toast'

// Owner/manager tool to open staff accounts outright — username, password,
// role and branch in one form (client request 5 Aug 2026: "so we finish the
// thing right there"). Until now a new hire had to sign themselves up and then
// redeem a role code.
export default function StaffManager() {
  const { t } = useLanguage()
  const { profile, isOwner } = useAuth()
  const [staff, setStaff] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({
    full_name: '', phone: '', username: '', password: '', role: 'receptionist', branch_id: '',
  })

  const fetchAll = async () => {
    try {
      const [staffRes, branchRes] = await Promise.all([
        supabase.rpc('admin_list_staff'),
        supabase.from('branches').select('id, name, active').eq('active', true).order('name'),
      ])
      if (staffRes.error) throw staffRes.error
      setStaff(staffRes.data || [])
      setBranches(branchRes.data || [])
    } catch (err) {
      console.error('Staff load error:', err)
      toast.error(errorMessage(err, t('staffAdmin.loadFailed')))
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll() }, [])

  const openAdd = () => {
    setEditing(null)
    setForm({ full_name: '', phone: '', username: '', password: '', role: 'receptionist', branch_id: '' })
    setShowForm(true)
  }

  const openEdit = (s) => {
    setEditing(s)
    setForm({
      full_name: s.full_name || '',
      phone: s.phone || '',
      username: fromLoginEmail(s.email),
      password: '',
      role: s.role,
      branch_id: s.branch_id || '',
    })
    setShowForm(true)
  }

  // The server enforces all of this too (migration 029) — this only keeps the
  // form from offering something that will be refused.
  const grantableRoles = ROLES.filter(r => r !== 'owner' || isOwner)

  const save = async (e) => {
    e.preventDefault()
    if (!form.full_name.trim()) return toast.error(t('staffAdmin.nameRequired'))
    if (!editing) {
      if (!form.username.trim()) return toast.error(t('staffAdmin.usernameRequired'))
      if (form.password.length < 6) return toast.error(t('staffAdmin.passwordTooShort'))
    }
    setSaving(true)
    try {
      if (editing) {
        await updateStaffProfile({
          userId: editing.id,
          fullName: form.full_name.trim(),
          phone: form.phone.trim(),
          role: form.role,
          branchId: form.branch_id || null,
          isActive: editing.is_active,
        })
        toast.success(t('staffAdmin.saved'))
      } else {
        await createStaffAccount({
          username: form.username.trim(),
          password: form.password,
          fullName: form.full_name.trim(),
          phone: form.phone.trim(),
          role: form.role,
          branchId: form.branch_id || null,
        })
        toast.success(t('staffAdmin.created'))
      }
      setShowForm(false)
      fetchAll()
    } catch (err) {
      toast.error(translateError(err, t))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (s) => {
    try {
      await updateStaffProfile({
        userId: s.id,
        fullName: s.full_name,
        phone: s.phone || '',
        role: s.role,
        branchId: s.branch_id || null,
        isActive: !s.is_active,
      })
      fetchAll()
    } catch (err) {
      toast.error(translateError(err, t))
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600" /> {t('staffAdmin.title')}
        </h2>
        <button onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 text-sm font-medium">
          <Plus className="w-4 h-4" /> {t('staffAdmin.add')}
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-4">{t('staffAdmin.hint')}</p>

      {loading ? (
        <div className="flex justify-center py-6"><div className="animate-spin w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>
      ) : staff.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">{t('staffAdmin.empty')}</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {staff.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${s.is_active ? 'bg-blue-100' : 'bg-gray-100'}`}>
                <Users className={`w-4 h-4 ${s.is_active ? 'text-blue-600' : 'text-gray-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${s.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                  {s.full_name}
                  {s.id === profile?.id && <span className="text-xs text-gray-400 font-normal"> · {t('staffAdmin.you')}</span>}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {fromLoginEmail(s.email)}
                  {s.branch_name ? ` · ${s.branch_name}` : ''}
                </p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium flex-shrink-0">
                {t(`staffAdmin.roles.${s.role}`)}
              </span>
              <button onClick={() => openEdit(s)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title={t('common.edit')}>
                <Pencil className="w-4 h-4" />
              </button>
              {s.id !== profile?.id && (
                <button onClick={() => toggleActive(s)}
                  className={`p-1.5 rounded hover:bg-gray-100 ${s.is_active ? 'text-red-500' : 'text-green-600'}`}
                  title={s.is_active ? t('staffAdmin.deactivate') : t('staffAdmin.activate')}>
                  <Power className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm my-8">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold">{editing ? t('staffAdmin.editTitle') : t('staffAdmin.addTitle')}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={save} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staffAdmin.name')} *</label>
                <input type="text" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staffAdmin.phone')}</label>
                <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
                  <AtSign className="w-3.5 h-3.5 text-gray-400" /> {t('staffAdmin.username')} {editing ? '' : '*'}
                </label>
                <input type="text" value={form.username} disabled={!!editing}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  placeholder={t('staffAdmin.usernamePlaceholder')} autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-500" />
                <p className="text-xs text-gray-400 mt-1">
                  {editing ? t('staffAdmin.usernameLocked') : t('staffAdmin.usernameHint')}
                </p>
              </div>

              {!editing && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('staffAdmin.password')} *</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={form.password} minLength={6}
                      onChange={e => setForm({ ...form, password: e.target.value })} autoComplete="new-password"
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{t('staffAdmin.passwordHint')}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staffAdmin.role')} *</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                  {grantableRoles.map(r => (
                    <option key={r} value={r}>{t(`staffAdmin.roles.${r}`)}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">{t('staffAdmin.roleHint')}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('staffAdmin.branch')}</label>
                <select value={form.branch_id} onChange={e => setForm({ ...form, branch_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                  <option value="">{t('staffAdmin.noBranch')}</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-blue-700 text-white font-medium rounded-lg hover:bg-blue-800 transition disabled:opacity-50">
                  {saving ? t('common.loading') : editing ? t('common.save') : t('staffAdmin.createAccount')}
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

// The RPC raises bare tags ('forbidden', 'owner_only', ...) and sign-up returns
// its own wording; both need to reach the user in their language.
function translateError(err, t) {
  const msg = (err?.message || '').toLowerCase()
  if (msg.includes('forbidden')) return t('staffAdmin.errors.forbidden')
  if (msg.includes('owner_only')) return t('staffAdmin.errors.ownerOnly')
  if (msg.includes('cannot_edit_self')) return t('staffAdmin.errors.cannotEditSelf')
  if (msg.includes('bad_role')) return t('staffAdmin.errors.badRole')
  if (msg.includes('name_required')) return t('staffAdmin.nameRequired')
  if (msg.includes('password_too_short')) return t('staffAdmin.passwordTooShort')
  if (msg.includes('username_required')) return t('staffAdmin.usernameRequired')
  if (msg.includes('already registered') || msg.includes('already been registered')) {
    return t('staffAdmin.errors.usernameTaken')
  }
  if (msg.includes('signup_blocked') || msg.includes('signups not allowed')) {
    return t('staffAdmin.errors.signupsDisabled')
  }
  return errorMessage(err, t('staffAdmin.errors.generic'))
}
