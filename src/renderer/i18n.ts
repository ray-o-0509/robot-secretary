import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import ja from './locales/ja.json'

const stored = typeof localStorage !== 'undefined' ? (localStorage.getItem('LANGUAGE_CODE') ?? '') : ''

export function toLng(langCode: string): string {
  if (langCode.startsWith('en')) return 'en'
  return 'ja'
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ja: { translation: ja },
    },
    lng: toLng(stored),
    fallbackLng: 'ja',
    interpolation: { escapeValue: false },
  })

export default i18n
