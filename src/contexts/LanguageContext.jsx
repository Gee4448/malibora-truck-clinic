import { createContext, useContext, useState, useCallback } from 'react'
import en from '../i18n/en.json'
import sw from '../i18n/sw.json'

const languages = { en, sw }

const LanguageContext = createContext()

export function LanguageProvider({ children }) {
  const [locale, setLocale] = useState(() => {
    return localStorage.getItem('malibora_lang') || 'en'
  })

  // t('a.b.c') as before; t('a.b.c', { count: 3 }) fills {count} in the string.
  const t = useCallback((key, vars) => {
    const keys = key.split('.')
    let value = languages[locale]
    for (const k of keys) {
      value = value?.[k]
    }
    if (typeof value !== 'string') return value || key
    if (!vars) return value
    return value.replace(/\{(\w+)\}/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
    )
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
