import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ja from './locales/ja.json'
import en from './locales/en.json'
import zh from './locales/zh.json'

const LANG_KEY = 'LANGUAGE_CODE'

// Map BCP-47 language tag to i18next language key
function resolveLanguage(code: string): string {
  if (code.startsWith('zh')) return 'zh'
  if (code.startsWith('en')) return 'en'
  return 'ja'
}

const savedCode = localStorage.getItem(LANG_KEY) ?? 'ja-JP'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ja: { translation: ja },
      en: { translation: en },
      zh: { translation: zh },
    },
    lng: resolveLanguage(savedCode),
    fallbackLng: 'ja',
    interpolation: { escapeValue: false },
  })

export function syncI18nLanguage(languageCode: string) {
  i18n.changeLanguage(resolveLanguage(languageCode))
}

export default i18n
