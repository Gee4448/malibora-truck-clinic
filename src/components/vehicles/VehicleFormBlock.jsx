import { Trash2 } from 'lucide-react'
import {
  VEHICLE_TYPES, FUEL_TYPES, ENGINE_TYPES, AXLE_OPTIONS,
  getMakes, getModels,
} from '../../lib/vehicleOptions'

// One vehicle entry inside a multi-vehicle list. Used by:
//   - Client self-register (mobile-first, large rounded inputs)
//   - Admin "Add Client" modal (compact desktop styling)
// Pass `variant="compact"` for the admin modal styling.
export default function VehicleFormBlock({
  index, vehicle, total, updateVehicle, removeVehicle, t,
  variant = 'default',
}) {
  const update = (field, value) => updateVehicle(index, { [field]: value })
  const compact = variant === 'compact'

  const inputCls = compact
    ? 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 text-sm'
    : 'w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900'
  const selectCls = `${inputCls} bg-white`
  const labelCls = compact
    ? 'block text-xs font-medium text-gray-700 mb-1'
    : 'block text-sm font-medium text-gray-700 mb-1.5'
  const blockCls = compact
    ? `space-y-2.5 ${total > 1 ? 'border border-gray-200 rounded-lg p-3' : ''}`
    : `space-y-3 ${total > 1 ? 'border border-gray-200 rounded-xl p-4 relative' : ''}`

  return (
    <div className={blockCls}>
      {total > 1 && (
        <div className="flex items-center justify-between mb-1">
          <span className={compact ? 'text-xs font-semibold text-gray-700' : 'text-sm font-semibold text-gray-700'}>
            {t('client.register.vehicleNumber').replace('{number}', index + 1)}
          </span>
          <button type="button" onClick={() => removeVehicle(index)}
            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium transition">
            <Trash2 className="w-3.5 h-3.5" />
            {t('client.register.removeVehicle')}
          </button>
        </div>
      )}

      <div>
        <label className={labelCls}>{t('client.register.vehicleType')} *</label>
        <select value={vehicle.vehicle_type} onChange={(e) =>
            updateVehicle(index, { vehicle_type: e.target.value, make: '', model: '', _customMake: false, _customModel: false })
          } className={selectCls}>
          {VEHICLE_TYPES.map(type => (
            <option key={type} value={type}>{t(`client.register.types.${type}`)}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>{t('client.register.makeLabel')} *</label>
        {vehicle._customMake ? (
          <div className="flex gap-2">
            <input value={vehicle.make} onChange={(e) => update('make', e.target.value)} required
              placeholder={t('client.register.typeMake')} className={`flex-1 ${inputCls}`} />
            <button type="button" onClick={() => updateVehicle(index, { _customMake: false, make: '', model: '', _customModel: false })}
              className="px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-500">
              {t('client.register.backToList')}
            </button>
          </div>
        ) : (
          <select value={vehicle.make} onChange={(e) => {
            if (e.target.value === '__other__') updateVehicle(index, { _customMake: true, make: '', model: '', _customModel: true })
            else updateVehicle(index, { make: e.target.value, model: '', _customModel: false })
          }} className={selectCls}>
            <option value="">{t('client.register.selectMake')}</option>
            {getMakes(vehicle.vehicle_type).map(m => <option key={m} value={m}>{m}</option>)}
            <option value="__other__">{t('client.register.otherMake')}</option>
          </select>
        )}
      </div>

      <div>
        <label className={labelCls}>{t('client.register.modelLabel')}</label>
        {vehicle._customModel || vehicle._customMake || !getModels(vehicle.vehicle_type)[vehicle.make] ? (
          <input value={vehicle.model} onChange={(e) => update('model', e.target.value)}
            placeholder={t('client.register.typeModel')} className={inputCls} />
        ) : (
          <select value={vehicle.model} onChange={(e) => {
            if (e.target.value === '__other__') updateVehicle(index, { _customModel: true, model: '' })
            else update('model', e.target.value)
          }} className={selectCls}>
            <option value="">{t('client.register.selectModel')}</option>
            {(getModels(vehicle.vehicle_type)[vehicle.make] || []).map(m => <option key={m} value={m}>{m}</option>)}
            <option value="__other__">{t('client.register.otherModel')}</option>
          </select>
        )}
      </div>

      <div>
        <label className={labelCls}>{t('client.register.plateLabel')} *</label>
        <input value={vehicle.registration_number}
          onChange={(e) => update('registration_number', e.target.value)} required
          placeholder="e.g. T 123 ABC"
          className={inputCls} style={{ textTransform: 'uppercase' }} />
      </div>

      <div>
        <label className={labelCls}>{t('client.register.engineTypeLabel')}</label>
        {vehicle._customEngine ? (
          <div className="flex gap-2">
            <input value={vehicle.engine_type} onChange={(e) => update('engine_type', e.target.value)}
              placeholder={t('client.register.typeEngine')} className={`flex-1 ${inputCls}`} />
            <button type="button" onClick={() => updateVehicle(index, { _customEngine: false, engine_type: '' })}
              className="px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-500">
              {t('client.register.backToList')}
            </button>
          </div>
        ) : (
          <select value={vehicle.engine_type} onChange={(e) => {
            if (e.target.value === '__other__') updateVehicle(index, { _customEngine: true, engine_type: '' })
            else update('engine_type', e.target.value)
          }} className={selectCls}>
            <option value="">{t('client.register.selectEngine')}</option>
            {ENGINE_TYPES.map(e => <option key={e} value={e}>{e}</option>)}
            <option value="__other__">{t('client.register.otherEngine')}</option>
          </select>
        )}
      </div>

      <div>
        <label className={labelCls}>{t('client.register.chassisLabel')}</label>
        <input value={vehicle.chassis_number}
          onChange={(e) => update('chassis_number', e.target.value)}
          className={inputCls} />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={labelCls}>{t('client.register.axlesLabel')}</label>
          <select value={vehicle.axles} onChange={(e) => update('axles', e.target.value)} className={selectCls}>
            <option value="">{t('client.register.selectAxles')}</option>
            {AXLE_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>{t('client.register.fuelTypeLabel')}</label>
          <select value={vehicle.fuel_type} onChange={(e) => update('fuel_type', e.target.value)} className={selectCls}>
            {FUEL_TYPES.map(type => (
              <option key={type} value={type}>{t(`client.register.fuels.${type}`)}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
