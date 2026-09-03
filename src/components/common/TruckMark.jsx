/* The house truck, as line art.
 *
 * Inline SVG rather than an image file, for three reasons that all matter here:
 * it costs no request on a Tanzanian phone connection, it stays sharp at any
 * size, and it inherits `currentColor` so it sits on the dark glass without a
 * second asset for light. A photo would also fight the material — the panels in
 * this app are translucent, and a rectangular photo behind one reads as a hole
 * punched through the glass rather than as something printed on it.
 *
 * Drawn as a cab-over prime mover with a box body, which is what actually comes
 * through the yard (the seed data is a Scania R440). Everything is stroked in
 * `currentColor` at low alpha so the parent decides the ink; only the stripe and
 * the wheel hubs take brand orange, so the mark reads as one warm accent rather
 * than as a second illustration competing with the greeting.
 *
 * Decorative: aria-hidden, and it must never intercept a tap.
 */
export default function TruckMark({ className = '' }) {
  return (
    <svg
      viewBox="0 0 360 200"
      className={`pointer-events-none select-none ${className}`}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* Grounding shadow — without it the truck floats in the middle of the
          panel instead of standing on something. */}
      <ellipse cx="184" cy="178" rx="150" ry="7" fill="currentColor" opacity="0.07" />

      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <g opacity="0.34">
          {/* Box body */}
          <path d="M26 44 h196 a4 4 0 0 1 4 4 v86 a4 4 0 0 1-4 4 H26 a4 4 0 0 1-4-4 V48 a4 4 0 0 1 4-4 z" />
          {/* Body ribs — a plain rectangle reads as a crate, not as a truck body */}
          <path d="M74 50 v82 M122 50 v82 M170 50 v82" opacity="0.5" />
          {/* Chassis rail under the body, running back from the cab */}
          <path d="M22 141 H236" opacity="0.75" />

          {/* Cab: flat-fronted, roof deflector, stepped door */}
          <path d="M240 138 V70 a12 12 0 0 1 12-12 h62 a12 12 0 0 1 12 12 l6 30 v38 z" />
          {/* Windscreen */}
          <path d="M252 72 h60 a4 4 0 0 1 4 4 v22 a4 4 0 0 1-4 4 h-60 a4 4 0 0 1-4-4 V76 a4 4 0 0 1 4-4 z" opacity="0.7" />
          {/* Door seam + handle */}
          <path d="M266 106 v32" opacity="0.55" />
          <path d="M256 118 h6" opacity="0.55" />
          {/* Mirror arm */}
          <path d="M246 76 h-10 v14" opacity="0.6" />
          {/* Grille and step */}
          <path d="M322 110 h10 M322 120 h10" opacity="0.55" />

          {/* Mudguards */}
          <path d="M62 140 a30 30 0 0 1 60 0" opacity="0.6" />
          <path d="M266 140 a30 30 0 0 1 60 0" opacity="0.6" />
        </g>

        {/* Wheels sit at full strength: they are the silhouette cue that makes
            the shape read as a truck at a glance. */}
        <g opacity="0.46">
          <circle cx="92" cy="150" r="21" />
          <circle cx="92" cy="150" r="8" opacity="0.7" />
          <circle cx="152" cy="150" r="21" />
          <circle cx="152" cy="150" r="8" opacity="0.7" />
          <circle cx="296" cy="150" r="21" />
          <circle cx="296" cy="150" r="8" opacity="0.7" />
        </g>
      </g>

      {/* The one warm accent. */}
      <g fill="var(--brand-orange, #f16001)">
        <rect x="22" y="96" width="204" height="7" rx="3.5" opacity="0.5" />
        <circle cx="92" cy="150" r="3.4" opacity="0.85" />
        <circle cx="152" cy="150" r="3.4" opacity="0.85" />
        <circle cx="296" cy="150" r="3.4" opacity="0.85" />
      </g>
    </svg>
  )
}
