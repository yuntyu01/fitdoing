import { MapPin } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Settings } from '../../../db/schema';
import { BottomSheet } from '../../../ui/BottomSheet';
import { FullButton } from '../../../ui/FullButton';
import { usePalette, useThemedStyles, type Palette } from '../../../ui/theme';
import { fonts, layout, radius, text } from '../../../ui/tokens';
import { currentPlace } from '../../location/currentPlace';

type Place = Pick<Settings['gym'], 'name' | 'address' | 'lat' | 'lng'>;

interface Props {
  visible: boolean;
  value: Place;
  onClose: () => void;
  onConfirm: (p: Place) => void;
}

/** 헬스장 이름 + 지금 위치로 좌표·주소 잡기 */
export function GymPlaceSheet({ visible, value, onClose, onConfirm }: Props) {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const [draft, setDraft] = useState<Place>(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 열릴 때(또는 열린 채로 값이 바뀔 때) 초안을 값에 맞춘다
  const syncKey = visible ? value : null;
  const [seen, setSeen] = useState<Place | null>(null);
  if (seen !== syncKey) {
    setSeen(syncKey);
    if (syncKey) {
      setDraft(syncKey);
      setError(null);
    }
  }

  const locate = async () => {
    setBusy(true);
    setError(null);
    const r = await currentPlace();
    setBusy(false);
    if (r.ok) setDraft((d) => ({ ...d, lat: r.lat, lng: r.lng, address: r.address }));
    else setError(t(r.reason === 'denied' ? 'gym.locationDenied' : 'gym.locationFailed'));
  };

  const canSave = draft.lat !== null && draft.lng !== null;

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('gym.place')}>
      <View style={styles.body}>
        <Text style={styles.label}>{t('gym.placeName')}</Text>
        <TextInput
          value={draft.name}
          onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
          placeholder={t('gym.placeNamePlaceholder')}
          placeholderTextColor={c.faint}
          style={styles.input}
          selectionColor={c.text}
        />
        <Pressable
          onPress={locate}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => [styles.locate, pressed && styles.pressed]}
        >
          {busy ? <ActivityIndicator color={c.text} /> : <MapPin size={20} color={c.text} strokeWidth={1.8} />}
          <View style={styles.locateText}>
            <Text style={styles.locateLabel}>{busy ? t('gym.locating') : t('gym.useCurrent')}</Text>
            {canSave ? (
              <Text style={styles.caption} numberOfLines={2}>
                {draft.address || `${draft.lat?.toFixed(5)}, ${draft.lng?.toFixed(5)}`}
              </Text>
            ) : null}
          </View>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.privacy}>{t('gym.privacy')}</Text>
      </View>
      <FullButton
        label={t('common.save')}
        disabled={!canSave}
        onPress={() => onConfirm({ ...draft, name: draft.name.trim() || t('gym.defaultName') })}
      />
    </BottomSheet>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    body: { gap: layout.related, marginBottom: layout.block },
    label: { ...text.caption, color: c.sub },
    input: {
      height: 52,
      borderRadius: radius.field,
      borderWidth: layout.hairline,
      borderColor: c.border,
      paddingHorizontal: 16,
      fontFamily: fonts.regular,
      fontSize: 16,
      color: c.text,
    },
    locate: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 52,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: radius.field,
      borderWidth: layout.hairline,
      borderColor: c.border,
      marginTop: layout.related,
    },
    pressed: { opacity: 0.6 },
    locateText: { flex: 1, gap: 2 },
    locateLabel: { ...text.label, color: c.text },
    caption: { ...text.caption, color: c.sub },
    error: { ...text.caption, color: c.text },
    privacy: { ...text.caption, color: c.sub, marginTop: layout.related },
  });
