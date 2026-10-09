import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { ThemeMode } from '../../db/schema';
import { BottomSheet } from '../../ui/BottomSheet';
import { FullButton } from '../../ui/FullButton';
import { RadioRow } from './editors/Form';

const MODES: ThemeMode[] = ['system', 'light', 'dark'];

interface Props {
  visible: boolean;
  value: ThemeMode;
  onClose: () => void;
  onSave: (mode: ThemeMode) => void;
}

/** 화면 모드: 시스템 · 라이트 · 다크 중 하나. 저장하면 설정 저장소가 바로 테마를 바꾼다. */
export function ThemeSheet({ visible, value, onClose, onSave }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ThemeMode>(value);

  // 열 때마다 지금 값으로 다시 시작한다 (닫으면 고른 값은 버린다)
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setDraft(value);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('settings.themeMode')}>
      <View style={styles.list}>
        {MODES.map((m) => (
          <RadioRow
            key={m}
            label={t(`settings.theme_${m}`)}
            desc={m === 'system' ? t('settings.themeSystemDesc') : undefined}
            selected={draft === m}
            onPress={() => setDraft(m)}
          />
        ))}
      </View>
      <FullButton label={t('edit.save')} onPress={() => onSave(draft)} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: 4, marginBottom: 20 },
});
