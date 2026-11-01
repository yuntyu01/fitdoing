import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PHOTO_KEEP_OPTIONS } from '../../domain/photoKeep';
import { BottomSheet } from '../../ui/BottomSheet';
import { FullButton } from '../../ui/FullButton';
import { RadioRow } from './editors/Form';

interface Props {
  visible: boolean;
  value: number | null;
  onClose: () => void;
  onSave: (days: number | null) => void;
}

/** 폰에 끼니 사진을 며칠 둘지 고른다. */
export function PhotoKeepSheet({ visible, value, onClose, onSave }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);

  // 열 때마다 지금 값으로 다시 시작한다 (닫으면 고른 값은 버린다)
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setDraft(value);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('settings.photoKeep')}>
      <View style={styles.list}>
        {PHOTO_KEEP_OPTIONS.map((d) => (
          <RadioRow
            key={String(d)}
            label={d === null ? t('settings.photoKeepForever') : t('settings.photoKeepDays', { n: d })}
            selected={draft === d}
            onPress={() => setDraft(d)}
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
