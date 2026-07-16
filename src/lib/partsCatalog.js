// Parts-selection tree for the client "Report a Problem" form.
// Three levels: vehicle category → system → part. The client multi-selects
// parts; the selection is written onto the job card as a reported-parts list
// (no prices — staff call the customer and build the proforma afterwards).
//
// To add a new system or part later, just add a row here — no schema change.
// Labels are { en, sw }; the p() helper covers parts whose technical name is
// the same in both languages.

const p = (en, sw) => ({ en, sw: sw || en })

export const PART_CATEGORIES = [
  {
    id: 'light',
    emoji: '🚗',
    label: p('Light Vehicle', 'Gari Ndogo'),
    hint: p('Saloon, SUV, small pickup', 'Saloon, SUV, Pickup ndogo'),
    systems: [
      {
        id: 'engine',
        label: p('Engine System', 'Mfumo wa Injini'),
        parts: [
          p('Engine block / cylinders', 'Engine block / silinda'),
          p('Cylinder head / valves'),
          p('Timing belt / timing chain'),
          p('Fuel system (fuel pump, injectors, filter)', 'Mfumo wa mafuta (fuel pump, injectors, filter)'),
          p('Cooling system (radiator, water pump, thermostat, fan)', 'Mfumo wa kupoza (radiator, water pump, thermostat, fan)'),
          p('Turbo / intercooler'),
          p('Engine oil system (oil pump, oil filter, gaskets)', 'Mfumo wa mafuta ya injini (oil pump, oil filter, gaskets)'),
          p('Exhaust system', 'Ecarost / exhaust system'),
          p('Alternator / starter motor'),
          p('Engine sensors (ECU sensors)', 'Sensa za injini (ECU sensors)'),
        ],
      },
      {
        id: 'transmission',
        label: p('Transmission System (gear lever to gearbox)', 'Mfumo wa Gia (gear lever hadi gearbox)'),
        parts: [
          p('Gear lever / gear stick'),
          p('Clutch (plate, cover, release bearing)'),
          p('Gearbox (manual/automatic)', 'Gearbox yenyewe (manual/automatic)'),
          p('Propeller shaft'),
          p('CV joints / drive shafts'),
          p('Gearbox mounts', 'Mount za gearbox'),
        ],
      },
      {
        id: 'axle',
        label: p('Axle & Differential', 'Axle na Differential'),
        parts: [
          p('Front axle'),
          p('Rear axle'),
          p('Differential (crown wheel & pinion)'),
          p('Wheel bearings'),
          p('Half shafts'),
        ],
      },
      {
        id: 'electrical',
        label: p('Electrical System', 'Mfumo wa Umeme'),
        parts: [
          p('Battery'),
          p('Alternator / charging system'),
          p('Wiring harness'),
          p('ECU / control modules'),
          p('Lights (headlights, indicators, tail lights)', 'Taa (headlights, indicators, tail lights)'),
          p('Dashboard / instrument cluster'),
          p('AC electrical (compressor clutch, fan motors)'),
        ],
      },
      {
        id: 'brakes',
        label: p('Brake System', 'Breki'),
        parts: [
          p('Disc / drum brakes'),
          p('Brake pads / shoes'),
          p('Master cylinder'),
          p('Brake booster'),
          p('ABS module & sensors', 'ABS module na sensa'),
        ],
      },
      {
        id: 'steering',
        label: p('Steering', 'Usukani'),
        parts: [
          p('Steering rack / box'),
          p('Power steering pump'),
          p('Tie rods / ball joints'),
        ],
      },
      {
        id: 'suspension',
        label: p('Suspension'),
        parts: [
          p('Shock absorbers'),
          p('Springs (coil/leaf)'),
          p('Control arms / bushings'),
        ],
      },
      {
        id: 'body',
        label: p('Body & Paint', 'Bodi na Rangi'),
        parts: [
          p('Panel beating (door, bonnet, fender, boot)', 'Panel beating (mlango, bonnet, fender, boot)'),
          p('Spray painting'),
          p('Bumper / grille'),
          p('Glass (windows, windscreen)', 'Vioo (windows, windscreen)'),
        ],
      },
    ],
  },
  {
    id: 'heavy',
    emoji: '🚛',
    label: p('Heavy Truck', 'Lori Kubwa'),
    hint: p('Scania, MAN, Fuso, Isuzu FVR etc.', 'Scania, MAN, Fuso, Isuzu FVR n.k.'),
    systems: [
      {
        id: 'engine',
        label: p('Engine System', 'Mfumo wa Injini'),
        parts: [
          p('Engine block / cylinder liners'),
          p('Cylinder head / valves'),
          p('Turbocharger / intercooler'),
          p('Common rail fuel system / injection pump'),
          p('EGR system'),
          p('Cooling system (radiator, water pump, fan clutch)', 'Mfumo wa kupoza (radiator, water pump, fan clutch)'),
          p('Oil system / oil cooler'),
          p('Exhaust / DPF / AdBlue (SCR) system'),
          p('Starter motor / alternator'),
        ],
      },
      {
        id: 'transmission',
        label: p('Transmission System (gear lever to gearbox)', 'Mfumo wa Gia (gear lever hadi gearbox)'),
        parts: [
          p('Gear lever / gear selector (mechanical/electronic)'),
          p('Clutch / clutch booster (pneumatic)'),
          p('Gearbox (manual, AMT, or with retarder)', 'Gearbox (manual, AMT, au yenye retarder)'),
          p('PTO (Power Take-Off)'),
          p('Propeller shaft(s)'),
          p('Retarder (if fitted)', 'Retarder (kama ipo)'),
        ],
      },
      {
        id: 'axle',
        label: p('Axle & Differential', 'Axle na Differential'),
        parts: [
          p('Front steer axle'),
          p('Drive axles (tandem/tridem)'),
          p('Differential & differential lock', 'Differential na differential lock'),
          p('Wheel hub reduction'),
          p('Wheel bearings'),
        ],
      },
      {
        id: 'electrical',
        label: p('Electrical System', 'Mfumo wa Umeme'),
        parts: [
          p('Battery bank'),
          p('Alternator / charging'),
          p('Wiring harness (CAN bus / multiplexed wiring)'),
          p('ECU modules (engine, transmission, brake)'),
          p('All lights (headlights, marker lights, indicators)', 'Taa zote (headlights, marker lights, indicators)'),
          p('Tachograph'),
          p('Dashboard / instrument cluster'),
        ],
      },
      {
        id: 'air',
        label: p('Pneumatic / Air System', 'Mfumo wa Upepo'),
        parts: [
          p('Air compressor'),
          p('Air tanks / reservoirs'),
          p('Air dryer'),
          p('Air brake valves'),
          p('Brake chambers / S-cam'),
          p('Slack adjusters'),
          p('Air suspension (ECAS, if fitted)', 'Air suspension (ECAS, kama ipo)'),
          p('Clutch booster (pneumatic)'),
        ],
      },
      {
        id: 'brakes',
        label: p('Brake System', 'Breki'),
        parts: [
          p('Air brakes (drum/disc)'),
          p('Brake chambers'),
          p('ABS/EBS module'),
          p('Handbrake / parking brake (spring brake)'),
        ],
      },
      {
        id: 'cabin',
        label: p('Cabin & Chassis', 'Cabin na Chassis'),
        parts: [
          p('Cab mounting / cab air suspension', 'Cab mounting / air suspension ya cabin'),
          p('Cab tilt mechanism'),
          p('Chassis frame / cross members'),
          p('Fifth wheel coupling (prime mover)', 'Fifth wheel coupling (kama ni prime mover)'),
        ],
      },
      {
        id: 'body',
        label: p('Body & Paint', 'Bodi na Rangi'),
        parts: [
          p('Panel beating'),
          p('Spray painting'),
          p('Chassis extension'),
          p('Steering conversion'),
          p('Tag axle addition'),
        ],
      },
    ],
  },
  {
    id: 'trailer',
    emoji: '🚚',
    label: p('Trailer', 'Trela'),
    hint: p('Flatbed, Tanker, Container, Lowbed'),
    systems: [
      {
        id: 'electrical',
        label: p('Electrical System', 'Mfumo wa Umeme'),
        parts: [
          p('Wiring loom / harness'),
          p('Light plug (7-pin / 15-pin ISO)', 'Plug ya taa (7-pin / 15-pin ISO)'),
          p('ABS/EBS sensors & modulator', 'ABS/EBS sensors na modulator'),
          p('Marker lights / tail lights / indicators'),
          p('Side lights'),
        ],
      },
      {
        id: 'air',
        label: p('Pneumatic / Air System', 'Mfumo wa Upepo'),
        parts: [
          p('Air lines (prime mover to trailer)', 'Air lines (kutoka prime mover hadi trela)'),
          p('Air tanks'),
          p('Brake valves (relay valve, load sensing valve)'),
          p('Air suspension bags'),
          p('Height control valve'),
        ],
      },
      {
        id: 'axle',
        label: p('Axle System'),
        parts: [
          p('Axle beams'),
          p('Wheel hubs'),
          p('Brake drums / discs'),
          p('Suspension (leaf spring or air suspension)', 'Suspension (leaf spring au air suspension)'),
          p('Wheel bearings'),
        ],
      },
      {
        id: 'body',
        label: p('Body / Chassis', 'Bodi / Chassis'),
        parts: [
          p('Main chassis frame'),
          p('Container twist locks'),
          p('Tarpaulin / curtain system (curtain-side)', 'Tarpaulin / curtain system (kama ni curtain-side)'),
          p('Floor (decking)'),
          p('Side panels / doors'),
          p('Trailer construction (full custom build)', 'Trailer construction (custom build kabisa)'),
        ],
      },
    ],
  },
]

// Map a vehicle's registered vehicle_type (see vehicleOptions.js VEHICLE_TYPES)
// to the category whose systems apply to it. 'other'/unknown → no suggestion.
export function categoryForVehicleType(vehicleType) {
  switch ((vehicleType || '').toLowerCase()) {
    case 'truck':
    case 'bus':
    case 'machine':
      return 'heavy'
    case 'trailer':
      return 'trailer'
    case 'car':
    case 'suv':
    case 'pickup':
      return 'light'
    default:
      return null
  }
}

// Build the job-card description block from the selection. Bilingual headers
// so staff and mechanics can read it regardless of the client's language.
// `selectedKeys` is a Set of "systemId|partIndex" strings.
export function buildReportedPartsText(categoryId, selectedKeys, notes, locale = 'en') {
  const category = PART_CATEGORIES.find(c => c.id === categoryId)
  if (!category) return (notes || '').trim()

  const lines = []
  lines.push(`Sehemu zilizoripotiwa / Reported parts — ${category.emoji} ${category.label.sw} / ${category.label.en}`)

  for (const system of category.systems) {
    const chosen = system.parts
      .map((part, i) => (selectedKeys.has(`${system.id}|${i}`) ? part[locale] : null))
      .filter(Boolean)
    if (chosen.length > 0) {
      lines.push(`• ${system.label.sw} / ${system.label.en}: ${chosen.join('; ')}`)
    }
  }

  if (notes && notes.trim()) {
    lines.push(`Maelezo mengine / Other notes: ${notes.trim()}`)
  }
  return lines.join('\n')
}
