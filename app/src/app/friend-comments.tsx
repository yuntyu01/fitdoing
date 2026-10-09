import { router, useLocalSearchParams, type Href } from 'expo-router';
import { ArrowUp } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '../features/friends/components/Placeholders';
import { Empty, ErrorView, Loading } from '../features/friends/components/States';
import { useComments } from '../features/friends/data';
import { timeAgo } from '../features/friends/format';
import type { FriendComment } from '../features/friends/types';
import { SubHeader } from '../ui/Headers';
import { Screen } from '../ui/Screen';
import { usePalette, useThemedStyles, type Palette } from '../ui/theme';
import { fonts, layout, radius, text } from '../ui/tokens';

const MAX = 300;

/**
 * 게시물 댓글 (/friend-comments?postId=): 오래된 것부터, 아래 고정 입력칸(키보드 위로 올라온다).
 * 내 댓글은 길게 누르거나 '삭제'로 지운다.
 */
export default function FriendCommentsScreen() {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ postId?: string }>();
  const postId = typeof params.postId === 'string' ? params.postId : undefined;
  const { comments, loading, error, refresh, send, remove } = useComments(postId);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/friends' as Href));
  const trimmed = body.trim();
  const canSend = trimmed.length > 0 && !sending && comments !== null;

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    const ok = await send(trimmed);
    setSending(false);
    if (ok) setBody('');
    else Alert.alert(t('friends.error.sendFailed'));
  };

  const askDelete = (cm: FriendComment) =>
    Alert.alert(t('friends.deleteComment'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('friends.delete'),
        style: 'destructive',
        onPress: () => {
          void remove(cm.id).then((ok) => {
            if (!ok) Alert.alert(t('friends.error.offline'));
          });
        },
      },
    ]);

  const footer = (
    <View style={styles.inputRow}>
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder={t('friends.commentPlaceholder')}
        placeholderTextColor={c.faint}
        multiline
        maxLength={MAX}
        style={styles.input}
        selectionColor={c.text}
        accessibilityLabel={t('friends.commentPlaceholder')}
      />
      <Pressable
        onPress={() => void submit()}
        disabled={!canSend}
        style={({ pressed }) => [styles.send, !canSend && styles.disabled, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={t('friends.send')}
      >
        {sending ? (
          <ActivityIndicator color={c.onPrimary} />
        ) : (
          <ArrowUp size={20} color={c.onPrimary} strokeWidth={2.2} />
        )}
      </Pressable>
    </View>
  );

  return (
    <Screen header={<SubHeader title={t('friends.commentsTitle')} onBack={back} />} footer={footer} gap={0}>
      {comments ? (
        comments.length === 0 ? (
          <Empty title={t('friends.noComments')} body={t('friends.noCommentsBody')} />
        ) : (
          comments.map((cm) => <CommentRow key={cm.id} comment={cm} onDelete={() => askDelete(cm)} />)
        )
      ) : loading ? (
        <Loading />
      ) : (
        <ErrorView error={error ?? 'notFound'} onRetry={error !== 'notFound' ? () => void refresh() : undefined} />
      )}
    </Screen>
  );
}

function CommentRow({ comment, onDelete }: { comment: FriendComment; onDelete: () => void }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onLongPress={comment.mine ? onDelete : undefined}
      style={styles.row}
      accessibilityHint={comment.mine ? t('friends.deleteHint') : undefined}
    >
      <Avatar name={comment.name} size={32} />
      <View style={styles.rowText}>
        <View style={styles.meta}>
          <Text style={styles.name} numberOfLines={1}>
            {comment.name}
          </Text>
          <Text style={styles.time}>{timeAgo(t, comment.createdAt)}</Text>
          {comment.mine ? (
            <Pressable onPress={onDelete} hitSlop={8} accessibilityRole="button" style={styles.deleteBtn}>
              <Text style={styles.time}>{t('friends.delete')}</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.body}>{comment.body}</Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
    rowText: { flex: 1, gap: 2 },
    meta: { flexDirection: 'row', alignItems: 'center', gap: layout.related },
    name: { ...text.body, fontFamily: fonts.semibold, color: c.text, flexShrink: 1 },
    time: { ...text.caption, color: c.sub },
    deleteBtn: { marginLeft: 'auto' },
    body: { ...text.body, color: c.text },
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    input: {
      flex: 1,
      minWidth: 0,
      minHeight: 48,
      maxHeight: 120,
      borderRadius: radius.field,
      borderWidth: layout.hairline,
      borderColor: c.border,
      backgroundColor: c.card,
      paddingHorizontal: 16,
      paddingTop: 13,
      paddingBottom: 13,
      ...text.body,
      color: c.text,
    },
    send: {
      width: 48,
      height: 48,
      borderRadius: radius.field,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    disabled: { opacity: 0.35 },
    pressed: { opacity: 0.85 },
  });
