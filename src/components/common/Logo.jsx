import { useState } from 'react'
import { Truck } from 'lucide-react'

// Renders the real Malibora logo from /malibora-logo.png (drop the file into
// `public/`). The supplied asset is a horizontal lockup sitting inside a white
// disc with a lot of surrounding padding, so we CSS-crop to just the lockup —
// otherwise the wordmark renders tiny in a short header. The crop math below is
// tuned to THIS asset's geometry (447x400, lockup content box ≈ x41..407,
// y135..248); if the logo file is replaced with a differently-framed image,
// re-measure and update CROP.
//
// Until the file exists — or if it fails to load — it falls back to the icon +
// wordmark so nothing ever shows a broken image.
//
// Props:
//   height         rendered logo height in px (default 36)
//   showText       show the "Malibora / Truck Clinic" wordmark in the fallback
//   iconClassName  classes for the fallback Truck icon
const CROP = { x: 41, y: 135, w: 366, h: 113, imgW: 447, imgH: 400 }

export default function Logo({
  height = 36,
  showText = true,
  iconClassName = 'w-8 h-8 text-blue-700',
}) {
  const [failed, setFailed] = useState(false)

  if (!failed) {
    const s = height / CROP.h
    // Probe the asset so we can fall back if it 404s (a background-image gives
    // no onError, so we drive `failed` from a hidden <img>).
    return (
      <>
        <img
          src="/malibora-logo.png"
          alt=""
          aria-hidden="true"
          onError={() => setFailed(true)}
          style={{ display: 'none' }}
        />
        <div
          role="img"
          aria-label="Malibora Intertrade"
          style={{
            width: `${CROP.w * s}px`,
            height: `${height}px`,
            backgroundImage: 'url(/malibora-logo.png)',
            backgroundRepeat: 'no-repeat',
            backgroundSize: `${CROP.imgW * s}px ${CROP.imgH * s}px`,
            backgroundPosition: `${-CROP.x * s}px ${-CROP.y * s}px`,
          }}
        />
      </>
    )
  }

  // Fallback: brand mark + wordmark
  return (
    <div className="flex items-center gap-2">
      <Truck className={iconClassName} />
      {showText && (
        <div className="leading-tight">
          <span className="block text-sm font-bold text-gray-900">Malibora</span>
          <span className="block text-xs text-gray-500">Truck Clinic</span>
        </div>
      )}
    </div>
  )
}
