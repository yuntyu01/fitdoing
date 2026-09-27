import 'i18next';

import type ko from './locales/ko.json';

// t('tabs.today') 키를 타입으로 검사한다. ko.json이 기준.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof ko };
  }
}
