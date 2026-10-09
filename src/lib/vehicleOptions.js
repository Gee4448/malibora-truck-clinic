// Shared vehicle dropdown data used by both the client self-register flow and
// the admin "Add Client" walk-in flow. Keep this file as the single source of
// truth so the two forms can never drift apart.

export const VEHICLE_TYPES = ['truck', 'trailer', 'suv', 'pickup', 'bus', 'machine', 'car', 'other']
export const FUEL_TYPES = ['diesel', 'petrol', 'electric', 'hybrid']

// Common colours offered as quick suggestions; the field also accepts free text.
export const COLORS = [
  'White', 'Black', 'Silver', 'Grey', 'Blue', 'Red', 'Green',
  'Yellow', 'Orange', 'Brown', 'Maroon', 'Gold',
]

export const TRUCK_MAKES = [
  'Scania', 'Volvo', 'DAF', 'MAN', 'Shacman', 'Mercedes-Benz', 'Iveco',
  'Renault Trucks', 'FAW', 'Hino', 'Isuzu', 'Mitsubishi Fuso',
  'Sinotruk', 'Dongfeng', 'Foton', 'JAC', 'Beiben', 'TATA',
]

export const TRUCK_MODELS = {
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

export const TRAILER_MAKES = ['BPW', 'ROR', 'SAF']

export const TRAILER_MODELS = {
  'BPW': ['Flatbed', 'Tipper', 'Tanker', 'Lowbed', 'Skeletal', 'Side Curtain', 'Box Body'],
  'ROR': ['Flatbed', 'Tipper', 'Tanker', 'Lowbed', 'Skeletal', 'Side Curtain', 'Box Body'],
  'SAF': ['Flatbed', 'Tipper', 'Tanker', 'Lowbed', 'Skeletal', 'Side Curtain', 'Box Body'],
}

export const ENGINE_TYPES = [
  'Diesel', 'Diesel Turbo', 'Diesel Turbo Intercooler',
  'Common Rail Diesel', 'Euro 3 Diesel', 'Euro 4 Diesel', 'Euro 5 Diesel', 'Euro 6 Diesel',
  'Petrol', 'Petrol Turbo', 'Petrol Hybrid',
  'CNG', 'LNG', 'LPG',
  'Diesel-Electric Hybrid', 'Electric', 'Hydrogen Fuel Cell',
]

export const AXLE_OPTIONS = [
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
  { value: '6', label: '6+' },
]

export const getMakes = (type) => type === 'trailer' ? TRAILER_MAKES : TRUCK_MAKES
export const getModels = (type) => type === 'trailer' ? TRAILER_MODELS : TRUCK_MODELS

export const emptyVehicle = () => ({
  registration_number: '', chassis_number: '', make: '', model: '',
  year: '', color: '', vehicle_type: 'truck', mileage_km: '',
  _customMake: false, _customModel: false, _customType: false,
})

// A saved vehicle, back into the shape VehicleFormBlock edits. The form picks
// make/model/type from lists, so a value that is not on the list (typed in
// when the vehicle was added) has to open in "type your own" mode or the
// dropdown would show it blank — and saving would wipe it.
export const vehicleToForm = (v) => {
  const type = v.vehicle_type || 'truck'
  const customType = !VEHICLE_TYPES.includes(type)
  const make = v.make || ''
  const customMake = customType || (make !== '' && !getMakes(type).includes(make))
  const model = v.model || ''
  const knownModels = getModels(type)[make] || []
  const customModel = customMake || (model !== '' && !knownModels.includes(model))
  return {
    id: v.id,
    registration_number: v.registration_number || '',
    chassis_number: v.chassis_number || '',
    make, model,
    year: v.year ?? '',
    color: v.color || '',
    vehicle_type: type,
    mileage_km: v.mileage_km ?? '',
    _customMake: customMake, _customModel: customModel, _customType: customType,
  }
}

// The columns a vehicle form writes, for insert or update.
export const vehicleRow = (v) => ({
  vehicle_type: v.vehicle_type,
  make: v.make.trim(),
  model: v.model?.trim() || null,
  registration_number: v.registration_number.toUpperCase().trim(),
  chassis_number: v.chassis_number || null,
  year: v.year ? parseInt(v.year) : null,
  color: v.color?.trim() || null,
  mileage_km: v.mileage_km !== '' && v.mileage_km != null ? parseInt(v.mileage_km) : null,
})
