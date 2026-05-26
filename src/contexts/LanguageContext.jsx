import { createContext, useContext, useState, useCallback } from 'react'
import en from '../i18n/en.json'
import sw from '../i18n/sw.json'

const languages = { en, sw }

const LanguageContext = createContext()

export function LanguageProvider({ children }) {
  const [locale, setLocale] = useState(() => {
    return localStorage.getItem('malibora_lang') || 'en'
  })

  const t = useCallback((key) => {
    const keys = key.split('.')
    let value = languages[locale]
    for (const k of keys) {
      value = value?.[k]
    }
    return value || key
  }, [locale])

  const switchLanguage = (lang) => {
    setLocale(lang)
    localStorage.setItem('malibora_lang', lang)
  }

  return (
    <LanguageContext.Provider value={{ locale, t, switchLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('useLanguage must be used within LanguageProvider')
  return context
}
