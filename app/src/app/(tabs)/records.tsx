import { useTranslation } from 'react-i18next';

import { Placeholder } from '../../ui/Placeholder';

export default function RecordsScreen() {
  const { t } = useTranslation();
  return <Placeholder title={t('tabs.records')} desc={t('placeholder.records')} />;
}
