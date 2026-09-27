import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import ko from './locales/ko.json';

export const resources = { ko: { translation: ko }, en: { translation: en } } as const;

// 기기 언어가 한국어가 아니면 영어로 보여준다.
const deviceLang = getLocales()[0]?.languageCode === 'ko' ? 'ko' : 'en';

i18n.use(initReactI18next).init({
  resources,
  lng: deviceLang,
  fallbackLng: 'ko',
  interpolation: { escapeValue: false },
});

export default i18n;
