import { useState, useEffect } from 'react'
import { useLanguage } from '../../contexts/LanguageContext'
import { Download, X } from 'lucide-react'

export default function InstallPrompt() {
  const { t } = useLanguage()
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    const dismissed = sessionStorage.getItem('malibora_install_dismissed')
    if (dismissed) return

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone
    if (isStandalone) return

    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShow(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setShow(false)
  }

  const handleDismiss = () => {
    setShow(false)
    sessionStorage.setItem('malibora_install_dismissed', '1')
  }

  if (!show) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:max-w-sm animate-slide-up">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 flex items-start gap-3">
        <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Download className="w-5 h-5 text-blue-700" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-gray-900">{t('install.title')}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{t('install.description')}</p>
          <div className="flex items-center gap-2 mt-2.5">
            <button onClick={handleInstall}
              className="px-4 py-1.5 bg-blue-700 text-white text-xs font-medium rounded-lg hover:bg-blue-800 transition">
              {t('install.button')}
            </button>
            <button onClick={handleDismiss}
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 font-medium transition">
              {t('install.dismiss')}
            </button>
          </div>
        </div>
        <button onClick={handleDismiss} className="p-1 rounded-lg hover:bg-gray-100 flex-shrink-0">
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
    </div>
  )
}
