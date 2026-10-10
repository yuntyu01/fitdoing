import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AppState } from 'react-native';

import * as LockModule from '../../../../modules/lock-engine';
import { FormNote, FormSection, RadioRow } from '../../features/settings/editors/Form';
import { useSettings, useSettingsValue } from '../../features/settings/store';
import { FullButton } from '../../ui/FullButton';
import { SubHeader } from '../../ui/Headers';
import { ListRow } from '../../ui/ListRow';
import { Screen } from '../../ui/Screen';
import { Toggle } from '../../ui/Toggle';

const PERMISSIONS = ['usageAccess', 'overlay', 'exactAlarm', 'notifications'] as const;

export default function EditLock() {
  const { t } = useTranslation();
  const settings = useSettingsValue();
  const update = useSettings((s) => s.update);
  const [minutes, setMinutes] = useState(settings.lockMinutes);
  const [emergency, setEmergency] = useState(settings.emergencyPerWeek);
  const [allowed, setAllowed] = useState(settings.allowedApps);
  const [permissions, setPermissions] = useState<LockModule.PermissionStatus | null>(null);
  const [apps, setApps] = useState<LockModule.LaunchableApp[]>([]);

  useEffect(() => {
    let mounted = true;
    const refresh = () => LockModule.getPermissionStatus().then((p) => { if (mounted) setPermissions(p); })
      .catch(() => { if (mounted) setPermissions(null); });
    void refresh();
    void LockModule.getLaunchableApps().then((a) => { if (mounted) setApps(a); }).catch(() => {});
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    return () => { mounted = false; sub.remove(); };
  }, []);

  const openPermission = async (kind: LockModule.PermissionKind) => {
    try {
      if (await LockModule.openPermissionSettings(kind)) return;
    } catch { /* Show an actionable error instead of claiming permission is granted. */ }
    Alert.alert(t('lockSetup.openFailed'));
  };

  return (
    <Screen header={<SubHeader title={t('lockSetup.title')} onBack={() => router.back()} />}
      footer={<FullButton label={t('edit.save')} onPress={() => {
        update({ lockMinutes: minutes, emergencyPerWeek: emergency, allowedApps: allowed });
        router.back();
      }} />}>
      <FormSection title={t('lockSetup.permissions')} note={t('lockSetup.disclosure')}>
        {!LockModule.isAvailable ? <FormNote>{t('lockSetup.unavailable')}</FormNote> : null}
        {PERMISSIONS.map((kind) => <ListRow key={kind} label={t(`lockSetup.${kind}`)}
          desc={t(`lockSetup.${kind}Desc`)}
          value={permissions?.[kind] ? t('lockSetup.allowed') : t('lockSetup.setup')}
          disabled={!LockModule.isAvailable} onPress={() => void openPermission(kind)} />)}
      </FormSection>
      <FormSection title={t('settings.lockMinutes')}>
        {[30, 60, 120].map((value) => <RadioRow key={value} label={t('lockSetup.minutes', { n: value })}
          selected={minutes === value} onPress={() => setMinutes(value)} />)}
      </FormSection>
      <FormSection title={t('settings.emergency')}>
        {[1, 2, 3].map((value) => <RadioRow key={value} label={t('settings.emergencyValue', { n: value })}
          selected={emergency === value} onPress={() => setEmergency(value)} />)}
      </FormSection>
      <FormSection title={t('settings.allowedApps')} note={t('lockSetup.alwaysAllowed')}>
        {apps.map((app) => <ListRow key={app.packageName} label={app.label}
          right={<Toggle value={allowed.includes(app.packageName)} onChange={(on) =>
            setAllowed((old) => on ? [...old, app.packageName] : old.filter((p) => p !== app.packageName))} />} />)}
      </FormSection>
    </Screen>
  );
}
