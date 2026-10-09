import { router, type Href } from 'expo-router';
import { Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { askUnfriend } from '../features/friends/actions';
import { Avatar } from '../features/friends/components/Placeholders';
import { Empty, errorKey, ErrorView, Loading } from '../features/friends/components/States';
import { useFriendCode, useFriendList } from '../features/friends/data';
import type { FriendSummary } from '../features/friends/types';
import { Divider, SectionLabel } from '../ui/Card';
import { SubHeader } from '../ui/Headers';
import { Screen } from '../ui/Screen';
import { usePalette, useThemedStyles, type Palette } from '../ui/theme';
import { fonts, layout, radius, text } from '../ui/tokens';

/**
 * 친구 관리 (/friends-manage): 내 친구 코드(길게 눌러 복사, 공유), 친구 코드로 추가, 친구 목록(끊기).
 * 코드를 입력하면 바로 서로 친구가 된다(요청·수락 단계 없음).
 */
export default function FriendsManageScreen() {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const code = useFriendCode();
  const list = useFriendList();
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/friends' as Href));
  const typed = input.replace(/[\s-]/g, '');

  const add = async () => {
    if (!typed || adding) return;
    setAdding(true);
    setMessage(null);
    const err = await list.add(typed);
    setAdding(false);
    if (err) {
      setMessage(t(errorKey(err === 'notFound' ? 'codeNotFound' : err)));
    } else {
      setInput('');
      setMessage(t('friends.added'));
    }
  };

  const share = () => {
    if (code.code) void Share.share({ message: t('friends.shareMessage', { code: code.code }) }).catch(() => {});
  };

  return (
    <Screen header={<SubHeader title={t('friends.manageTitle')} onBack={back} />} gap={layout.block + 4}>
      {/* 내 코드 */}
      <View style={styles.section}>
        <SectionLabel>{t('friends.myCode')}</SectionLabel>
        {code.code ? (
          <View style={styles.codeRow}>
            {/* expo-clipboard가 없어서 복사는 글자 선택(길게 누르기)으로 한다 */}
            <Text style={styles.code} selectable accessibilityLabel={code.code.split('').join(' ')}>
              {code.code}
            </Text>
            <Pressable
              onPress={share}
              hitSlop={12}
              style={styles.shareBtn}
              accessibilityRole="button"
              accessibilityLabel={t('friends.shareCode')}
            >
              <Share2 size={20} color={c.text} strokeWidth={1.8} />
            </Pressable>
          </View>
        ) : code.loading ? (
          <ActivityIndicator style={styles.codeLoading} color={c.sub} />
        ) : (
          <Pressable onPress={() => void code.refresh()} accessibilityRole="button">
            <Text style={styles.body}>{`${t(errorKey(code.error ?? 'server'))} ${t('friends.retry')}`}</Text>
          </Pressable>
        )}
        <Text style={styles.caption}>{t('friends.myCodeDesc')}</Text>
      </View>

      {/* 코드로 추가 */}
      <View style={styles.section}>
        <SectionLabel>{t('friends.addByCode')}</SectionLabel>
        <View style={styles.addRow}>
          <TextInput
            value={input}
            onChangeText={(v) => {
              setInput(v.toUpperCase());
              setMessage(null);
            }}
            placeholder={t('friends.codePlaceholder')}
            placeholderTextColor={c.faint}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            returnKeyType="done"
            onSubmitEditing={() => void add()}
            style={styles.input}
            selectionColor={c.text}
            accessibilityLabel={t('friends.addByCode')}
          />
          <Pressable
            onPress={() => void add()}
            disabled={!typed || adding}
            style={({ pressed }) => [styles.addBtn, (!typed || adding) && styles.disabled, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            {adding ? (
              <ActivityIndicator color={c.onPrimary} />
            ) : (
              <Text style={styles.addText}>{t('friends.add')}</Text>
            )}
          </Pressable>
        </View>
        {message ? <Text style={styles.caption}>{message}</Text> : null}
      </View>

      {/* 친구 목록 */}
      <View>
        <SectionLabel>
          {list.friends ? t('friends.listCount', { n: list.friends.length }) : t('friends.list')}
        </SectionLabel>
        {list.friends ? (
          list.friends.length === 0 ? (
            <Empty title={t('friends.emptyTitle')} body={t('friends.emptyManage')} />
          ) : (
            list.friends.map((f, i) => (
              <View key={f.id}>
                {i > 0 ? <Divider /> : null}
                <FriendRow friend={f} onRemove={() => askUnfriend(t, f, () => {}, list.remove)} />
              </View>
            ))
          )
        ) : list.loading ? (
          <Loading />
        ) : (
          <ErrorView error={list.error ?? 'server'} onRetry={() => void list.refresh()} />
        )}
      </View>
    </Screen>
  );
}

function FriendRow({ friend, onRemove }: { friend: FriendSummary; onRemove: () => void }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const d = new Date(friend.since);
  return (
    <View style={styles.row}>
      <Avatar name={friend.name} size={36} />
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>
          {friend.name}
        </Text>
        {Number.isNaN(d.getTime()) ? null : (
          <Text style={styles.caption}>{t('friends.since', { month: d.getMonth() + 1, day: d.getDate() })}</Text>
        )}
      </View>
      <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('friends.remove')}>
        <Text style={styles.remove}>{t('friends.remove')}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    section: { gap: layout.related },
    codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    // 핵심 값이라 숫자 크기(28, 굵게)로. 글자 코드라 tabular-nums는 빼고 자간만 벌린다.
    code: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34, color: c.text, letterSpacing: 3, flexShrink: 1 },
    codeLoading: { alignSelf: 'flex-start', marginVertical: 8 },
    shareBtn: {
      padding: 10,
      borderRadius: radius.field,
      borderWidth: layout.hairline,
      borderColor: c.border,
    },
    body: { ...text.body, color: c.text },
    caption: { ...text.caption, color: c.sub },
    addRow: { flexDirection: 'row', gap: 8 },
    input: {
      flex: 1,
      minWidth: 0,
      height: 52,
      borderRadius: radius.field,
      borderWidth: layout.hairline,
      borderColor: c.border,
      backgroundColor: c.card,
      paddingHorizontal: 16,
      fontFamily: fonts.medium,
      fontSize: 17,
      letterSpacing: 1,
      color: c.text,
    },
    addBtn: {
      height: 52,
      minWidth: 72,
      paddingHorizontal: 18,
      borderRadius: radius.field,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addText: { ...text.bodyMedium, fontFamily: fonts.semibold, color: c.onPrimary },
    disabled: { opacity: 0.35 },
    pressed: { opacity: 0.85 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    rowText: { flex: 1, gap: 2 },
    name: { ...text.label, color: c.text },
    remove: { ...text.caption, color: c.sub },
  });
