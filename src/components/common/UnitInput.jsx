import { useState } from 'react'
import { UNITS } from '../../lib/units'

// Unit of measure for a line (044): a dropdown of the usual units, with
// "Other…" for anything else ("drum", "can"), typed. A dropdown rather than a
// free-text box with suggestions, because a suggestion list only shows units
// matching what is already typed — with "pc" in the box, "kg" never appears.
export default function UnitInput({ value, onChange, className = '', otherLabel = 'Other…', ...rest }) {
  const v = value ?? ''
  const [typing, setTyping] = useState(() => v !== '' && !UNITS.includes(v))

  if (typing) {
    return (
      <input type="text" value={v} maxLength={20} autoFocus
        onChange={e => onChange(e.target.value)}
        onBlur={() => { if (!v.trim()) setTyping(false) }}
        className={className} {...rest} />
    )
  }
  return (
    <select value={UNITS.includes(v) ? v : ''} className={className} {...rest}
      onChange={e => {
        if (e.target.value === '__other__') { setTyping(true); onChange('') }
        else onChange(e.target.value)
      }}>
      <option value="">—</option>
      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
      <option value="__other__">{otherLabel}</option>
    </select>
  )
}
