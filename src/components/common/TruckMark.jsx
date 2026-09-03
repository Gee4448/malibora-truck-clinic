/* The house truck, drawn as a technical line study.
 *
 * Inline SVG rather than an image file, for three reasons that all matter here:
 * it costs no request on a Tanzanian phone connection, it stays sharp at any
 * size, and it inherits `currentColor` so it sits on the dark glass without a
 * second asset for light. A photo would also fight the material — the panels in
 * this app are translucent, and a rectangular photo behind one reads as a hole
 * punched through the glass rather than as something printed on it.
 *
 * An articulated outfit: cab-over tractor on the right, tri-axle box semitrailer
 * behind it, which is what actually comes through the yard. Proportioned 3.2:1
 * like a real side elevation — the earlier version was 1.8:1 and read as a rigid
 * box van, because that is the shape a short wheelbase makes.
 *
 * Weights are deliberate. The outline carries the silhouette, panel seams and
 * fenders sit a step back, and only the wheel hubs and the body seam take brand
 * orange, so the drawing stays one warm accent rather than a second illustration
 * competing with whatever text it sits behind. Everything is stroked in
 * `currentColor`, so the parent decides the ink and the alpha.
 *
 * Decorative: aria-hidden, and it must never intercept a tap.
 */
/* Wheel centres are written out rather than mapped over. Five literals are no
   harder to read than a loop, and they keep this file convertible to static SVG
   by `scripts/lib/truck-svg.mjs`, which is how the probes render it. */
export default function TruckMark({ className = '' }) {
  return (
    <svg
      viewBox="0 0 600 190"
      className={`pointer-events-none select-none ${className}`}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* Grounding shadow — without it the outfit floats in the middle of the
          panel instead of standing on something. */}
      <ellipse cx="310" cy="176" rx="250" ry="6" fill="currentColor" opacity="0.06" />

      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* --- silhouette -------------------------------------------------- */}
        <g strokeWidth="3.4" opacity="0.42">
          {/* Box semitrailer */}
          <path d="M45 22 h355 a5 5 0 0 1 5 5 v91 h-365 v-91 a5 5 0 0 1 5 -5 z" />
          {/* Tractor: cab-over, roof a touch below the trailer line, front face
              raked out at the bottom. The vertical before the bottom-right
              corner must stop 8 short of the floor — run it to 128 and the arc
              lands at 136, and `z` closes the shape with a diagonal slashed
              across the whole cab. */}
          <path d="M452 128 v-82 a14 14 0 0 1 14 -14 h86 a18 18 0 0 1 18 18 v28 l8 10 v32 a8 8 0 0 1 -8 8 z" />
        </g>

        {/* --- structure --------------------------------------------------- */}
        <g strokeWidth="2.2" opacity="0.3">
          {/* Chassis rail running the length of both units */}
          <path d="M40 126 h534" />
          {/* Rear door seam and body panel joins */}
          <path d="M58 22 v96" />
          <path d="M128 26 v88 M212 26 v88 M296 26 v88 M368 26 v88" opacity="0.62" />
          {/* Landing legs, and the fifth-wheel coupling the trailer sits on */}
          <path d="M330 128 v16 M344 128 v16" />
          <path d="M424 118 h22 M435 118 v8" />
          {/* Cab side window */}
          <path d="M478 50 h66 a4 4 0 0 1 4 4 v24 a4 4 0 0 1 -4 4 h-66 a4 4 0 0 1 -4 -4 v-24 a4 4 0 0 1 4 -4 z" />
          {/* Door shut line, handle, cab steps */}
          <path d="M474 84 v44 M480 100 h10 M466 132 h15 M466 140 h15" opacity="0.7" />
          {/* Mirror arm */}
          <path d="M570 54 h14 M584 48 v20" opacity="0.7" />
          {/* Grille slats and headlamp */}
          <path d="M566 96 h12 M566 104 h12" opacity="0.7" />
          <path d="M560 112 h16 a4 4 0 0 1 4 4 v4 h-20 z" opacity="0.7" />
        </g>

        {/* --- fenders ------------------------------------------------------ */}
        <g strokeWidth="2.2" opacity="0.24">
          <path d="M66 126 q26 -26 52 0 q22 -26 48 0 q22 -26 48 0" />
          <path d="M404 126 q26 -26 52 0" />
          <path d="M509 126 q26 -26 52 0" />
        </g>

        {/* --- running gear -------------------------------------------------
            Full strength: the wheels are the cue that makes the shape read as a
            truck before any of the detail resolves. */}
        <g opacity="0.5">
          <g strokeWidth="3.4">
            <circle cx="92" cy="150" r="20" />
            <circle cx="140" cy="150" r="20" />
            <circle cx="188" cy="150" r="20" />
            <circle cx="430" cy="150" r="20" />
            <circle cx="535" cy="150" r="20" />
          </g>
          <g strokeWidth="2.2" opacity="0.75">
            <circle cx="92" cy="150" r="8.5" />
            <circle cx="140" cy="150" r="8.5" />
            <circle cx="188" cy="150" r="8.5" />
            <circle cx="430" cy="150" r="8.5" />
            <circle cx="535" cy="150" r="8.5" />
          </g>
        </g>
      </g>

      {/* The one warm accent: the body seam, and the hubs. */}
      <g fill="var(--brand-orange, #f16001)">
        <rect x="40" y="86" width="365" height="4" rx="2" opacity="0.45" />
        <g opacity="0.8">
          <circle cx="92" cy="150" r="3" />
          <circle cx="140" cy="150" r="3" />
          <circle cx="188" cy="150" r="3" />
          <circle cx="430" cy="150" r="3" />
          <circle cx="535" cy="150" r="3" />
        </g>
      </g>
    </svg>
  )
}
