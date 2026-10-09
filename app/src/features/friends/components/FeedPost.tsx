import { router, type Href } from 'expo-router';
import { ChevronRight, Ellipsis, Heart, MessageCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usePalette, useThemedStyles, type Palette } from '../../../ui/theme';
import { fonts, layout, radius, text } from '../../../ui/tokens';
import { useCheer } from '../data';
import { clockText, kcalText, macrosText, timeAgo } from '../format';
import type { FriendPost } from '../types';
import { Avatar, PostPhoto } from './Placeholders';

const PHOTO_RATIO = 4 / 3;

/** 친구의 하루 화면 주소 */
export const dayHref = (post: Pick<FriendPost, 'friendId' | 'date'>) =>
  `/friend?id=${encodeURIComponent(post.friendId)}&date=${post.date}` as Href;

/** 댓글 화면 주소 */
export const commentsHref = (postId: string) => `/friend-comments?postId=${encodeURIComponent(postId)}` as Href;

/**
 * 피드 게시물 하나 (= 친구가 공유한 한 끼, 또는 헬스 인증). 바깥 상자 없이 아바타·이름 줄, 사진,
 * 그 아래 끼니·시각·음식·영양, 응원·댓글.
 */
export function FeedPost({ post, onMore }: { post: FriendPost; onMore: () => void }) {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const cheer = useCheer(post);
  const time = clockText(post.loggedAt);

  return (
    <View style={styles.post}>
      <View style={styles.head}>
        <Avatar name={post.name} />
        <View style={styles.headText}>
          <Text style={styles.nameLine} numberOfLines={1}>
            <Text style={styles.name}>{post.name}</Text>
            <Text style={styles.ago}>{` · ${timeAgo(t, post.loggedAt)}`}</Text>
          </Text>
          {post.kind === 'gym' ? <Text style={styles.gymLine}>{t('friends.gymPost')}</Text> : null}
        </View>
        <Pressable onPress={onMore} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('friends.more')}>
          <Ellipsis size={22} color={c.sub} strokeWidth={1.8} />
        </Pressable>
      </View>

      <PostPhoto post={post} iconSize={40} style={styles.photo} />

      <View style={styles.info}>
        <View style={styles.infoHead}>
          <Text style={styles.when}>
            {post.kind === 'meal' ? t('friends.mealAt', { n: post.mealIndex, time }) : t('friends.gymAt', { time })}
          </Text>
          <Pressable
            style={styles.link}
            onPress={() => router.push(dayHref(post))}
            hitSlop={8}
            accessibilityRole="link"
          >
            <Text style={styles.linkText}>{t('friends.seeDay')}</Text>
            <ChevronRight size={16} color={c.sub} strokeWidth={1.8} />
          </Pressable>
        </View>
        {post.kind === 'meal' && post.items.length > 0 ? (
          <Text style={styles.food}>{post.items.join(' · ')}</Text>
        ) : null}
        {post.nutrition ? (
          <Text style={styles.nutrition}>{`${kcalText(t, post.nutrition)} · ${macrosText(t, post.nutrition)}`}</Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Pressable
          style={styles.action}
          onPress={cheer.toggle}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ selected: cheer.cheered }}
        >
          <Heart
            size={22}
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
          <MessageCircle size={22} color={c.sub} strokeWidth={1.8} />
          <Text style={styles.actionText}>{t('friends.commentCount', { n: cheer.comments })}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    post: { gap: 14 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headText: { flex: 1, gap: 2 },
    nameLine: { ...text.body },
    name: { fontFamily: fonts.semibold, color: c.text },
    ago: { ...text.caption, color: c.sub },
    gymLine: { ...text.caption, color: c.sub },
    photo: { width: '100%', aspectRatio: PHOTO_RATIO, borderRadius: radius.card, overflow: 'hidden' },
    info: { gap: 4 },
    infoHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    when: { ...text.body, fontFamily: fonts.semibold, color: c.text, fontVariant: ['tabular-nums'], flexShrink: 1 },
    link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    linkText: { ...text.caption, color: c.sub },
    food: { ...text.heading, color: c.text, marginTop: layout.related - 4 },
    nutrition: { ...text.body, color: c.sub, fontVariant: ['tabular-nums'] },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 24 },
    action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    actionText: { ...text.caption, color: c.sub, fontVariant: ['tabular-nums'] },
  });
