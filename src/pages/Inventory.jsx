import { useState, useEffect } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase, formatTZS } from '../lib/supabase'
import { Plus, Search, Edit2, Trash2, X, Package, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Inventory() {
  const { t } = useLanguage()
  const { canViewInternal } = useAuth()
  const [parts, setParts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    part_number: '', name: '', description: '', category: 'general',
    cost_price: '', selling_price: '', quantity_in_stock: '',
    minimum_stock: '5', unit: 'piece', supplier_name: '',
    supplier_phone: '', location: '',
  })

  useEffect(() => { fetchParts() }, [])

  const fetchParts = async () => {
    try {
      const { data, error } = await supabase
        .from('parts')
        .select('*')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      setParts(data || [])
    } catch (err) {
      toast.error(t('inventory.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      ...form,
      cost_price: Number(form.cost_price),
      selling_price: Number(form.selling_price),
      quantity_in_stock: parseInt(form.quantity_in_stock) || 0,
      minimum_stock: parseInt(form.minimum_stock) || 5,
    }
    try {
      if (editingId) {
        await supabase.from('parts').update(payload).eq('id', editingId)
        toast.success(t('inventory.updated'))
      } else {
        await supabase.from('parts').insert(payload)
        toast.success(t('inventory.added'))
      }
      setShowForm(false)
      resetForm()
      fetchParts()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleEdit = (part) => {
    setForm({
      part_number: part.part_number || '', name: part.name || '',
      description: part.description || '', category: part.category || 'general',
      cost_price: part.cost_price || '', selling_price: part.selling_price || '',
      quantity_in_stock: part.quantity_in_stock || '', minimum_stock: part.minimum_stock || '5',
      unit: part.unit || 'piece', supplier_name: part.supplier_name || '',
      supplier_phone: part.supplier_phone || '', location: part.location || '',
    })
    setEditingId(part.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm(t('inventory.deactivateConfirm'))) return
    await supabase.from('parts').update({ is_active: false }).eq('id', id)
    toast.success(t('inventory.deactivated'))
    fetchParts()
  }

  const resetForm = () => {
    setForm({ part_number: '', name: '', description: '', category: 'general', cost_price: '', selling_price: '', quantity_in_stock: '', minimum_stock: '5', unit: 'piece', supplier_name: '', supplier_phone: '', location: '' })
    setEditingId(null)
  }

  const categories = ['general', 'engine', 'brake', 'suspension', 'electrical', 'body', 'transmission', 'cooling', 'fuel']

  const filtered = parts.filter(p => {
    const matchSearch = p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.part_number?.toLowerCase().includes(search.toLowerCase())
    const matchCat = categoryFilter === 'all' || p.category === categoryFilter
    return matchSearch && matchCat
  })

  const lowStockCount = parts.filter(p => p.quantity_in_stock <= p.minimum_stock).length
  const outOfStockCount = parts.filter(p => p.quantity_in_stock === 0).length

  const profitMargin = (cost, sell) => {
    if (!sell || sell === 0) return 0
    return (((sell - cost) / sell) * 100).toFixed(0)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('inventory.title')}</h1>
          <div className="flex gap-3 mt-1">
            <span className="text-xs text-gray-500">{parts.length} parts</span>
            {lowStockCount > 0 && (
              <span className="text-xs text-orange-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {lowStockCount} low stock
              </span>
            )}
            {outOfStockCount > 0 && (
              <span className="text-xs text-red-600">{outOfStockCount} out of stock</span>
            )}
          </div>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition text-sm font-medium">
          <Plus className="w-4 h-4" /> {t('inventory.addPart')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t('inventory.search')}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm">
          <option value="all">{t('common.all')} {t('common.categories')}</option>
          {categories.map(c => <option key={c} value={c}>{t(`inventory.categories.${c}`)}</option>)}
        </select>
      </div>

      {/* Parts Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center p-8"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left p-3 font-medium text-gray-600">{t('inventory.name')}</th>
                  <th className="text-left p-3 font-medium text-gray-600 hidden md:table-cell">{t('inventory.category')}</th>
                  {canViewInternal && <th className="text-right p-3 font-medium text-gray-600 hidden lg:table-cell">{t('inventory.costPrice')}</th>}
                  <th className="text-right p-3 font-medium text-gray-600">{t('inventory.sellingPrice')}</th>
                  {canViewInternal && <th className="text-right p-3 font-medium text-gray-600 hidden lg:table-cell">Margin</th>}
                  <th className="text-center p-3 font-medium text-gray-600">{t('inventory.quantity')}</th>
                  <th className="text-left p-3 font-medium text-gray-600 hidden lg:table-cell">{t('inventory.supplier')}</th>
                  <th className="text-right p-3 font-medium text-gray-600">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((part) => {
                  const isLow = part.quantity_in_stock <= part.minimum_stock
                  const isOut = part.quantity_in_stock === 0
                  return (
                    <tr key={part.id} className={`hover:bg-gray-50 ${isOut ? 'bg-red-50' : isLow ? 'bg-orange-50' : ''}`}>
                      <td className="p-3">
                        <p className="font-medium text-gray-900 flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-gray-400" />
                          {part.name}
                        </p>
                        {part.part_number && <p className="text-xs text-gray-400 ml-5">{part.part_number}</p>}
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 capitalize">
                          {t(`inventory.categories.${part.category}`)}
                        </span>
                      </td>
                      {canViewInternal && <td className="p-3 text-right hidden lg:table-cell text-gray-500">{formatTZS(part.cost_price)}</td>}
                      <td className="p-3 text-right font-medium">{formatTZS(part.selling_price)}</td>
                      {canViewInternal && (
                        <td className="p-3 text-right hidden lg:table-cell">
                          <span className={`text-xs font-medium ${profitMargin(part.cost_price, part.selling_price) > 20 ? 'text-green-600' : 'text-orange-600'}`}>
                            {profitMargin(part.cost_price, part.selling_price)}%
                          </span>
                        </td>
                      )}
                      <td className="p-3 text-center">
                        <span className={`inline-flex items-center gap-1 text-sm font-medium ${
                          isOut ? 'text-red-600' : isLow ? 'text-orange-600' : 'text-green-600'
                        }`}>
                          {isOut && <AlertTriangle className="w-3 h-3" />}
                          {part.quantity_in_stock} {part.unit}
                        </span>
                      </td>
                      <td className="p-3 hidden lg:table-cell text-gray-500 text-xs">{part.supplier_name || '-'}</td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleEdit(part)} className="p-1.5 rounded hover:bg-gray-100">
                            <Edit2 className="w-4 h-4 text-gray-500" />
                          </button>
                          <button onClick={() => handleDelete(part.id)} className="p-1.5 rounded hover:bg-red-50">
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold">{editingId ? t('inventory.edit') : t('inventory.addPart')}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('inventory.name')} *</label>
                  <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('inventory.partNumber')}</label>
                  <input type="text" value={form.part_number} onChange={e => setForm({...form, part_number: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('inventory.category')}</label>
                  <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    {categories.map(c => <option key={c} value={c}>{t(`inventory.categories.${c}`)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('inventory.costPrice')} *</label>
                  <input type="number" value={form.cost_price} onChange={e => setForm({...form, cost_price: e.target.value})} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('inventory.sellingPrice')} *</label>
                  <input type="number" value={form.selling_price} onChange={e => setForm({...form, selling_price: e.target.value})} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                {form.cost_price && form.selling_price && (
                  <div className="sm:col-span-2 bg-green-50 p-2 rounded text-sm text-green-700">
                    Margin: {profitMargin(Number(form.cost_price), Number(form.selling_price))}% |
                    Profit: {formatTZS(Number(form.selling_price) - Number(form.cost_price))} per unit
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('inventory.quantity')}</label>
                  <input type="number" value={form.quantity_in_stock} onChange={e => setForm({...form, quantity_in_stock: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('inventory.minStock')}</label>
                  <input type="number" value={form.minimum_stock} onChange={e => setForm({...form, minimum_stock: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('inventory.unit')}</label>
                  <select value={form.unit} onChange={e => setForm({...form, unit: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="piece">Piece</option>
                    <option value="litre">Litre</option>
                    <option value="metre">Metre</option>
                    <option value="set">Set</option>
                    <option value="pair">Pair</option>
                    <option value="kg">Kg</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('inventory.location')}</label>
                  <input type="text" value={form.location} onChange={e => setForm({...form, location: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Shelf A-3" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('inventory.supplier')}</label>
                  <input type="text" value={form.supplier_name} onChange={e => setForm({...form, supplier_name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('inventory.supplierPhone')}</label>
                  <input type="tel" value={form.supplier_phone} onChange={e => setForm({...form, supplier_phone: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 py-2.5 bg-blue-700 text-white font-medium rounded-lg hover:bg-blue-800 transition">{t('common.save')}</button>
                <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition">{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
