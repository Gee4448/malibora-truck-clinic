import { useState, useEffect } from 'react'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import { Landmark, Smartphone, Banknote, Wallet, Copy, Check } from 'lucide-react'
import toast from 'react-hot-toast'

const CHANNEL_ICONS = {
  bank: Landmark,
  mobile_money: Smartphone,
  cash: Banknote,
  other: Wallet,
}

// Where the customer actually sends the money. The portal has always let them
// DECLARE a payment but never told them what to pay into, so "pay" meant
// phoning the garage to ask for an account number. Staff maintain these in
// Settings; only the active ones are readable by the portal (migration 023).
export default function PaymentChannels() {
  const { t } = useLanguage()
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState(null)

  useEffect(() => {
    let alive = true
    supabase
      .from('payment_channels')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        if (!alive) return
        setChannels(data || [])
        setLoading(false)
      })
    return () => { alive = false }
  }, [])

  const copy = async (channel) => {
    if (!channel.account_number) return
    try {
      await navigator.clipboard.writeText(channel.account_number)
      setCopiedId(channel.id)
      toast.success(t('payments.copied'))
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // Clipboard is blocked on insecure origins and in some in-app browsers.
      // The number is on screen either way, so this is not worth an error toast.
    }
  }

  if (loading) return null

  // Nothing configured yet: say so plainly rather than rendering an empty box
  // the customer would read as "there is no way to pay".
  if (channels.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs text-amber-800">{t('payments.noChannels')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-500">{t('payments.payInto')}</p>
      {channels.map((c) => {
        const Icon = CHANNEL_ICONS[c.channel_type] || Wallet
        return (
          <div key={c.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-blue-700" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">{c.label}</p>
                {c.account_name && <p className="text-xs text-gray-500">{c.account_name}</p>}
                {c.account_number && (
                  <button
                    type="button"
                    onClick={() => copy(c)}
                    className="mt-1 inline-flex items-center gap-1.5 font-mono text-sm font-bold text-gray-900 hover:text-blue-700 cursor-pointer break-all text-left"
                  >
                    {c.account_number}
                    {copiedId === c.id
                      ? <Check className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                      : <Copy className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                  </button>
                )}
                {c.instructions && <p className="text-xs text-gray-500 mt-1">{c.instructions}</p>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
