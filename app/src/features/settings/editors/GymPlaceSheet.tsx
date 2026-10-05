import { MapPin } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Settings } from '../../../db/schema';
import { BottomSheet } from '../../../ui/BottomSheet';
import { FullButton } from '../../../ui/FullButton';
import { colors, fonts, radius, space, type } from '../../../ui/tokens';
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
          placeholderTextColor={colors.faint}
          style={styles.input}
          selectionColor={colors.text}
        />
        <Pressable onPress={locate} disabled={busy} style={styles.locate}>
          {busy ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <MapPin size={20} color={colors.text} strokeWidth={1.8} />
          )}
          <View style={styles.locateText}>
            <Text style={styles.locateLabel}>{busy ? t('gym.locating') : t('gym.useCurrent')}</Text>
            {draft.address ? (
              <Text style={type.caption} numberOfLines={2}>
                {draft.address}
              </Text>
            ) : null}
          </View>
        </Pressable>
        {error ? <Text style={type.caption}>{error}</Text> : null}
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

const styles = StyleSheet.create({
  body: { gap: space.s, marginBottom: space.l },
  label: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  input: {
    height: 56,
    borderRadius: radius.tile,
    backgroundColor: colors.bg,
    paddingHorizontal: space.m + space.xs,
    fontFamily: fonts.medium,
    fontSize: 17,
    color: colors.text,
  },
  locate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    padding: space.m,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: space.s,
  },
  locateText: { flex: 1, gap: 2 },
  locateLabel: { fontFamily: fonts.medium, fontSize: 17, color: colors.text },
  privacy: { ...type.caption, marginTop: space.s },
});
