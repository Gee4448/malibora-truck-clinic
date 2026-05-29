import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { useClient } from '../../contexts/ClientAuthContext'
import { supabase } from '../../lib/supabase'
import { Truck, Wrench, Search, MapPin, ArrowLeft, Send } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ClientNewRequest() {
  const { t } = useLanguage()
  const { customer } = useClient()
  const navigate = useNavigate()
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    vehicle_id: '',
    request_type: 'known_problem',
    description: '',
    customer_location: '',
  })

  useEffect(() => {
    if (customer?.id) fetchVehicles()
  }, [customer?.id])

  const fetchVehicles = async () => {
    try {
      const { data } = await supabase
        .from('vehicles')
        .select('id, registration_number, make, model')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
      setVehicles(data || [])
      if (data?.length === 1) {
        setForm(prev => ({ ...prev, vehicle_id: data[0].id }))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.vehicle_id) {
      toast.error(t('client.newRequest.fillRequired'))
      return
    }
    if (form.request_type === 'known_problem' && !form.description.trim()) {
      toast.error(t('client.newRequest.fillRequired'))
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.from('job_cards').insert({
        customer_id: customer.id,
        vehicle_id: form.vehicle_id,
        status: 'customer_request',
        request_type: form.request_type,
        description: form.description || `Inspection requested at ${form.customer_location}`,
        customer_location: form.customer_location || null,
        section: 'service',
        priority: 'normal',
      })
      if (error) throw error
      toast.success(t('client.newRequest.success'))
      navigate('/client/services')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (vehicles.length === 0) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" /> {t('common.back')}
        </button>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">{t('client.newRequest.noVehicles')}</p>
          <button onClick={() => navigate('/client/vehicles')}
            className="mt-4 px-4 py-2 bg-blue-700 text-white rounded-xl text-sm font-medium hover:bg-blue-800 transition">
            {t('client.vehicles.addVehicle')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> {t('common.back')}
      </button>

      <h1 className="text-lg font-bold text-gray-900">{t('client.newRequest.title')}</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Select Vehicle */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('client.newRequest.selectVehicle')} *
          </label>
          <select
            value={form.vehicle_id}
            onChange={e => setForm({ ...form, vehicle_id: e.target.value })}
            required
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900"
          >
            <option value="">{t('common.selectVehicle')}</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>
                {v.registration_number} — {v.make} {v.model || ''}
              </option>
            ))}
          </select>
        </div>

        {/* Request Type */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            {t('client.newRequest.requestType')}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setForm({ ...form, request_type: 'known_problem' })}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${
                form.request_type === 'known_problem'
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Wrench className={`w-6 h-6 ${form.request_type === 'known_problem' ? 'text-blue-600' : 'text-gray-400'}`} />
              <span className={`text-xs font-medium text-center ${form.request_type === 'known_problem' ? 'text-blue-700' : 'text-gray-600'}`}>
                {t('client.newRequest.knownProblem')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, request_type: 'inspection_needed' })}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${
                form.request_type === 'inspection_needed'
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Search className={`w-6 h-6 ${form.request_type === 'inspection_needed' ? 'text-blue-600' : 'text-gray-400'}`} />
              <span className={`text-xs font-medium text-center ${form.request_type === 'inspection_needed' ? 'text-blue-700' : 'text-gray-600'}`}>
                {t('client.newRequest.needInspection')}
              </span>
            </button>
          </div>
        </div>

        {/* Description */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {t('client.newRequest.describeIssue')} {form.request_type === 'known_problem' && '*'}
          </label>
          <textarea
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            required={form.request_type === 'known_problem'}
            rows={4}
            placeholder={t('client.newRequest.descriptionPlaceholder')}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none text-gray-900"
          />
        </div>

        {/* Location (for inspection) */}
        {form.request_type === 'inspection_needed' && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />
              {t('client.newRequest.location')}
            </label>
            <input
              type="text"
              value={form.customer_location}
              onChange={e => setForm({ ...form, customer_location: e.target.value })}
              placeholder={t('client.newRequest.locationPlaceholder')}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900"
            />
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-700 text-white font-medium rounded-xl hover:bg-blue-800 transition disabled:opacity-40 active:scale-[0.98]"
        >
          {submitting ? (
            <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <>
              <Send className="w-4 h-4" />
              {t('client.newRequest.submit')}
            </>
          )}
        </button>
      </form>
    </div>
  )
}
