import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import ja from './locales/ja.json'
import zh from './locales/zh.json'
import ko from './locales/ko.json'

export function toLng(langCode: string): string {
  if (langCode.startsWith('en')) return 'en'
  if (langCode.startsWith('zh')) return 'zh'
  if (langCode.startsWith('ko')) return 'ko'
  return 'ja'
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ja: { translation: ja },
      zh: { translation: zh },
      ko: { translation: ko },
    },
    lng: 'ja',
    fallbackLng: 'ja',
    interpolation: { escapeValue: false },
  })

export default i18n
