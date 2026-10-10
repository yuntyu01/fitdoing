import { MapPin, Search } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Settings } from '../../../db/schema';
import { BottomSheet } from '../../../ui/BottomSheet';
import { FullButton } from '../../../ui/FullButton';
import { usePalette, useThemedStyles, type Palette } from '../../../ui/theme';
import { fonts, layout, radius, text } from '../../../ui/tokens';
import { ApiError, searchPlaces, type PlaceHit } from '../../api/client';
import { currentPlace, roughPosition } from '../../location/currentPlace';

type Place = Pick<Settings['gym'], 'name' | 'address' | 'lat' | 'lng'>;

interface Props {
  visible: boolean;
  value: Place;
  onClose: () => void;
  onConfirm: (p: Place) => void;
}

const SHOWN = 6;

const distance = (m: number | null) =>
  m === null ? null : m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;

/**
 * 헬스장 고르기: 이름으로 검색해서 고르면 이름·주소·좌표가 함께 정해진다(카카오 장소 검색, 서버 경유).
 * 검색을 못 쓰거나 원하는 곳이 없으면 헬스장에 있을 때 "지금 위치로 설정".
 */
export function GymPlaceSheet({ visible, value, onClose, onConfirm }: Props) {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const [draft, setDraft] = useState<Place>(value);
  const [query, setQuery] = useState(value.name);
  const [hits, setHits] = useState<PlaceHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchOff, setSearchOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 열릴 때(또는 열린 채로 값이 바뀔 때) 초안을 값에 맞춘다
  const syncKey = visible ? value : null;
  const [seen, setSeen] = useState<Place | null>(null);
  if (seen !== syncKey) {
    setSeen(syncKey);
    if (syncKey) {
      setDraft(syncKey);
      setQuery(syncKey.name);
      setHits(null);
      setError(null);
    }
  }

  const search = async () => {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setError(null);
    try {
      setHits(await searchPlaces(q, await roughPosition()));
    } catch (e) {
      setHits(null);
      if (e instanceof ApiError && e.status === 503) setSearchOff(true);
      else setError(t('gym.searchFailed'));
    } finally {
      setSearching(false);
    }
  };

  const pick = (p: PlaceHit) => {
    setDraft({ name: p.name, address: p.address, lat: p.lat, lng: p.lng });
    setQuery(p.name);
    setHits(null);
  };

  const locate = async () => {
    setBusy(true);
    setError(null);
    const r = await currentPlace();
    setBusy(false);
    if (r.ok) setDraft((d) => ({ ...d, name: query.trim() || d.name, lat: r.lat, lng: r.lng, address: r.address }));
    else setError(t(r.reason === 'denied' ? 'gym.locationDenied' : 'gym.locationFailed'));
  };

  const canSave = draft.lat !== null && draft.lng !== null;

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('gym.place')}>
      <View style={styles.body}>
        <Text style={styles.label}>{searchOff ? t('gym.placeName') : t('gym.searchLabel')}</Text>
        <View style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={(v) => {
              setQuery(v);
              if (searchOff) setDraft((d) => ({ ...d, name: v }));
            }}
            onSubmitEditing={searchOff ? undefined : search}
            returnKeyType={searchOff ? 'done' : 'search'}
            placeholder={t('gym.placeNamePlaceholder')}
            placeholderTextColor={c.faint}
            style={styles.input}
            selectionColor={c.text}
            accessibilityLabel={t('gym.searchLabel')}
          />
          {searchOff ? null : (
            <Pressable
              onPress={search}
              disabled={searching || !query.trim()}
              accessibilityRole="button"
              accessibilityLabel={t('gym.search')}
              style={({ pressed }) => [styles.searchBtn, pressed && styles.pressed, !query.trim() && styles.off]}
            >
              {searching ? <ActivityIndicator color={c.text} /> : <Search size={20} color={c.text} strokeWidth={1.8} />}
            </Pressable>
          )}
        </View>

        {hits ? (
          hits.length === 0 ? (
            <Text style={styles.caption}>{t('gym.noResults')}</Text>
          ) : (
            <View style={styles.results}>
              {hits.slice(0, SHOWN).map((p, i) => (
                <Pressable
                  key={`${p.name}-${i}`}
                  onPress={() => pick(p)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.hit, i > 0 && styles.hitLine, pressed && styles.pressed]}
                >
                  <View style={styles.hitText}>
                    <Text style={styles.hitName} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={styles.caption} numberOfLines={1}>
                      {p.address}
                    </Text>
                  </View>
                  {distance(p.distanceM) ? <Text style={styles.caption}>{distance(p.distanceM)}</Text> : null}
                </Pressable>
              ))}
            </View>
          )
        ) : null}

        {canSave && !hits ? (
          <View style={styles.chosen}>
            <MapPin size={18} color={c.text} strokeWidth={1.8} />
            <View style={styles.hitText}>
              <Text style={styles.hitName} numberOfLines={1}>
                {draft.name || t('gym.defaultName')}
              </Text>
              {draft.address ? (
                <Text style={styles.caption} numberOfLines={2}>
                  {draft.address}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <Pressable
          onPress={locate}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => [styles.locate, pressed && styles.pressed]}
        >
          {busy ? <ActivityIndicator color={c.text} /> : <MapPin size={20} color={c.sub} strokeWidth={1.8} />}
          <Text style={styles.locateLabel}>{busy ? t('gym.locating') : t('gym.useCurrentHere')}</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.privacy}>{searchOff ? t('gym.privacy') : t('gym.privacySearch')}</Text>
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
    searchRow: { flexDirection: 'row', gap: 8 },
    input: {
      flex: 1,
      minWidth: 0,
      height: 52,
      borderRadius: radius.field,
      borderWidth: layout.hairline,
      borderColor: c.border,
      paddingHorizontal: 16,
      fontFamily: fonts.regular,
      fontSize: 16,
      color: c.text,
    },
    searchBtn: {
      width: 52,
      height: 52,
      borderRadius: radius.field,
      borderWidth: layout.hairline,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    results: { borderRadius: radius.field, borderWidth: layout.hairline, borderColor: c.border },
    hit: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    hitLine: { borderTopWidth: layout.hairline, borderTopColor: c.border },
    hitText: { flex: 1, gap: 2 },
    hitName: { ...text.label, color: c.text },
    chosen: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: radius.field,
      backgroundColor: c.selected,
    },
    locate: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
    locateLabel: { ...text.body, color: c.sub },
    pressed: { opacity: 0.6 },
    off: { opacity: 0.4 },
    caption: { ...text.caption, color: c.sub },
    error: { ...text.caption, color: c.text },
    privacy: { ...text.caption, color: c.sub, marginTop: layout.related },
  });
