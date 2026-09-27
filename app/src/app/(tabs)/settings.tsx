import { useTranslation } from 'react-i18next';

import { Placeholder } from '../../ui/Placeholder';

export default function SettingsScreen() {
  const { t } = useTranslation();
  return <Placeholder title={t('tabs.settings')} desc={t('placeholder.settings')} />;
}
