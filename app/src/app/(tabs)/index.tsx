import { useTranslation } from 'react-i18next';

import { Placeholder } from '../../ui/Placeholder';

export default function TodayScreen() {
  const { t } = useTranslation();
  return <Placeholder title={t('tabs.today')} desc={t('placeholder.today')} />;
}
