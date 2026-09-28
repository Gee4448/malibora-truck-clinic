import { useState } from 'react'
import { MessageCircle, Copy, Check, X, AlertTriangle } from 'lucide-react'
import { smsTemplates } from '../../lib/sms'
import { whatsappLink, portalUrl } from '../../lib/whatsapp'

// Shown right after a registration is approved or rejected, and reachable again
// later from the customer row, so staff can tell the customer the outcome.
//
// Why a modal instead of firing automatically: WhatsApp delivery needs a real
// tap from the staff member's own account, and an <a> inside a modal is a fresh
// user gesture that popup blockers always allow. It also lets staff read the
// message before it goes out, and edit it when a case needs explaining.
//
// The SMS for the same event has already been attempted by the caller. It is
// silently skipped while Africa's Talking is unprovisioned, which is exactly why
// this WhatsApp step is the one that actually reaches the customer today.
//
// kind 'credentials' is the office handing over a portal login (migration 043).
// `password` is only ever held here, in memory, for as long as the modal is
// open: the database keeps a hash, so this is the one moment it can be read.
export default function NotifyCustomerModal({ customer, kind, password, onClose, t }) {
  const [copied, setCopied] = useState(false)

  const defaultMessage = kind === 'credentials'
    ? smsTemplates.account_credentials(customer.full_name, customer.phone, password, portalUrl())
    : kind === 'approved'
      ? smsTemplates.account_approved(customer.full_name, portalUrl())
      : smsTemplates.account_rejected(customer.full_name)

  const [message, setMessage] = useState(defaultMessage)

  const link = whatsappLink(customer.phone, message)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard is blocked on insecure origins — the textarea is selectable,
      // so staff can still copy by hand rather than being stuck.
    }
  }

  return (
    <div className="fixed inset-0 glass-overlay z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto modal-card">
        <div className="flex items-start justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {kind === 'credentials' ? t('customers.login.modalTitle')
                : kind === 'approved' ? t('customers.notify.titleApproved') : t('customers.notify.titleRejected')}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {kind === 'credentials' ? t('customers.login.modalSubtitle') : t('customers.notify.subtitle')}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <span className="font-medium">{customer.full_name}</span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-500">{customer.phone || t('customers.notify.noPhone')}</span>
          </div>

          {/* Large enough to read out over the phone. */}
          {kind === 'credentials' && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
              <div>
                <p className="text-[11px] font-medium text-blue-700">{t('customers.login.username')}</p>
                <p className="font-mono font-semibold text-gray-900 break-all">{customer.phone}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-blue-700">{t('customers.login.password')}</p>
                <p className="font-mono font-semibold text-gray-900 tracking-wider break-all">{password}</p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              {t('customers.notify.messageLabel')}
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={kind === 'credentials' ? 6 : 4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none"
            />
          </div>

          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 transition active:scale-[0.98] cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              {t('customers.notify.sendWhatsApp')}
            </a>
          ) : (
            <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-orange-700">{t('customers.notify.noPhoneHint')}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              {copied ? t('customers.notify.copied') : t('customers.notify.copy')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition cursor-pointer"
            >
              {kind === 'credentials' ? t('customers.login.done') : t('customers.notify.later')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
