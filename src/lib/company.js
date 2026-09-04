// Who the business is and where it is, in one place.
//
// This exists because the address was wrong. "Arusha, Tanzania" was written out
// three times — the invoice header, the PDF header, and the Settings panel —
// and the business is in Dar es Salaam. Three copies is how a fact becomes
// wrong in three places at once, and the invoice one goes out to customers.
//
// Place names are not translated: "Majumba Sita" and "Tabata Dampo" are proper
// nouns and read the same in both languages. The ROLE labels ("Main office",
// "Garage") are shown through i18n where they appear next to other translated
// text; the addresses themselves are passed through as they are.
//
// Addresses supplied by Antony, 4 September 2026. The branch LIST that staff
// are assigned to lives in the `branches` table (migration 035) — this is the
// company's own letterhead, not that list, and the two are seeded from the same
// text on purpose.

export const COMPANY = {
  name: 'Malibora Truck Clinic',
  tagline: 'Professional Vehicle Service & Repair',
  country: 'Tanzania',

  // Head office first — `headOffice` below takes it from the top of this list.
  locations: [
    {
      city: 'Dar es Salaam',
      roleKey: 'company.mainOffice',
      address: 'Majumba Sita, opp. Majumba Sita BRT Station',
    },
    {
      city: 'Dar es Salaam',
      roleKey: 'company.garage',
      address: 'Tabata Dampo',
    },
    {
      city: 'Iringa',
      roleKey: 'company.branchOffice',
      address: 'Mlandege near TAG Church, Sokoni Street',
    },
    {
      city: 'Mafinga',
      roleKey: 'company.branch',
      address: 'Kinyanambo C, Mizani Street',
    },
  ],
}

export const headOffice = COMPANY.locations[0]

/** "Majumba Sita, opp. Majumba Sita BRT Station, Dar es Salaam" */
export const headOfficeLine = `${headOffice.address}, ${headOffice.city}`

/**
 * The address block on a printed document. Two lines rather than one: a
 * customer needs the office to send paperwork to and the yard to bring a truck
 * to, and they are on opposite sides of Dar. Kept short — this sits under the
 * company name in a header that also has to hold the invoice number and date.
 */
export const documentAddressLines = [
  headOfficeLine,
  `Garage: ${COMPANY.locations[1].address}  ·  Branches: Iringa, Mafinga`,
]

/** One line, for the band under the logo in the generated PDF. */
export const pdfSubtitle = `${COMPANY.tagline} | ${headOffice.address}, ${headOffice.city}`
