import { router } from 'expo-router';
import { Check, Clock, Heart, MessageCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { mealLabel } from '../../../domain/meals';

import { usePalette, useThemedStyles, type Palette } from '../../../ui/theme';
import { fonts, layout, radius, text } from '../../../ui/tokens';
import { useCheer } from '../data';
import { kcalText, macrosText } from '../format';
import type { FriendPost, TimelineItem } from '../types';
import { commentsHref } from './FeedPost';
import { PostPhoto } from './Placeholders';

const THUMB = 72;
const DOT = 8;

/**
 * 친구의 하루 시간 흐름. 왼쪽에 시각과 점, 점 사이를 잇는 가는 세로선. 오른쪽에 끼니·헬스 내용(상자 없이 구분선).
 * 기록한 끼니·인증한 헬스는 작은 체크 + 응원·댓글, 아직 안 찍은 끼니는 빈 점 + 시계 + 흐린 글자.
 */
export function DayTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <View>
      {items.map((e, i) => (
        <Entry
          key={e.kind === 'post' ? e.post.id : `planned-${e.mealIndex}`}
          item={e}
          first={i === 0}
          last={i === items.length - 1}
        />
      ))}
    </View>
  );
}

function Entry({ item, first, last }: { item: TimelineItem; first: boolean; last: boolean }) {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const planned = item.kind === 'planned';
  const post = item.kind === 'post' ? item.post : null;
  const title = post
    ? post.kind === 'gym'
      ? t('friends.gym')
      : mealLabel(t, post.mealIndex ?? 0)
    : t('friends.planned', { n: item.kind === 'planned' ? item.mealIndex : 0 });

  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <Text style={[styles.time, planned && styles.faint]}>{item.time}</Text>
        <View style={[styles.dot, planned && styles.dotHollow]} />
        {last ? null : <View style={styles.line} />}
      </View>

      <View style={[styles.content, !first && styles.divided]}>
        <View style={styles.titleRow}>
          {planned ? null : <Check size={16} color={c.text} strokeWidth={2.2} />}
          <Text style={[styles.title, planned && styles.titlePlanned]}>{title}</Text>
        </View>

        {post?.kind === 'meal' ? (
          <View style={styles.detail}>
            <PostPhoto post={post} iconSize={24} style={styles.thumb} />
            <View style={styles.texts}>
              {post.items.length > 0 ? <Text style={styles.food}>{post.items.join(' · ')}</Text> : null}
              {post.nutrition ? <Text style={styles.sub}>{kcalText(t, post.nutrition)}</Text> : null}
              {post.nutrition ? <Text style={styles.sub}>{macrosText(t, post.nutrition)}</Text> : null}
            </View>
          </View>
        ) : post?.kind === 'gym' ? (
          <View style={[styles.detail, styles.center]}>
            <PostPhoto post={post} iconSize={24} style={styles.thumb} />
            <Text style={[styles.food, styles.texts]}>{t('friends.gymVerified')}</Text>
          </View>
        ) : (
          <View style={[styles.detail, styles.center]}>
            <Clock size={20} color={c.faint} strokeWidth={1.8} />
            <Text style={[styles.sub, styles.faint, styles.texts]}>{t('friends.plannedNote')}</Text>
          </View>
        )}

        {post ? <EntryActions post={post} /> : null}
      </View>
    </View>
  );
}

/** 기록 하나의 응원·댓글 (피드와 같은 게시물이라 수가 같이 바뀐다) */
function EntryActions({ post }: { post: FriendPost }) {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const cheer = useCheer(post);
  return (
    <View style={styles.actions}>
      <Pressable
        style={styles.action}
        onPress={cheer.toggle}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ selected: cheer.cheered }}
      >
        <Heart
          size={18}
          color={cheer.cheered ? c.text : c.sub}
          fill={cheer.cheered ? c.text : 'none'}
          strokeWidth={1.8}
        />
        <Text style={styles.actionText}>{t('friends.cheerCount', { n: cheer.count })}</Text>
      </Pressable>
      <Pressable
        style={styles.action}
        onPress={() => router.push(commentsHref(post.id))}
        hitSlop={8}
        accessibilityRole="button"
      >
        <MessageCircle size={18} color={c.sub} strokeWidth={1.8} />
        <Text style={styles.actionText}>{t('friends.commentCount', { n: cheer.comments })}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: 12 },
    // 시각 위, 점 아래, 그 아래로 다음 항목까지 선이 내려간다
    rail: { width: 44, alignItems: 'center', paddingTop: 18 },
    time: { ...text.caption, color: c.sub, fontVariant: ['tabular-nums'] },
    dot: { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: c.text, marginTop: 6 },
    dotHollow: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: c.faint },
    line: { flex: 1, width: layout.hairline, backgroundColor: c.line, marginTop: 6 },
    content: { flex: 1, paddingVertical: 16, gap: 10 },
    divided: { borderTopWidth: layout.hairline, borderTopColor: c.line },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    title: { ...text.label, fontFamily: fonts.semibold, color: c.text },
    titlePlanned: { color: c.sub },
    detail: { flexDirection: 'row', gap: 14 },
    center: { alignItems: 'center' },
    thumb: { width: THUMB, height: THUMB, borderRadius: radius.field, overflow: 'hidden' },
    texts: { flex: 1, gap: 2 },
    food: { ...text.label, color: c.text },
    sub: { ...text.body, color: c.sub, fontVariant: ['tabular-nums'] },
    faint: { color: c.faint },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 20 },
    action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    actionText: { ...text.caption, color: c.sub, fontVariant: ['tabular-nums'] },
  });
