import { Dumbbell, Utensils } from 'lucide-react-native';
import { useState } from 'react';
import { Image, StyleSheet, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

import { usePalette, useThemedStyles, type Palette } from '../../../ui/theme';
import { fonts } from '../../../ui/tokens';
import { usePhotoSource } from '../data';
import type { FriendPost } from '../types';

/** 프로필 동그라미. 프로필 사진 기능이 없어서 이름 첫 글자 */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.letter, { fontSize: size * 0.42, lineHeight: size * 0.56 }]}>{name.slice(0, 1)}</Text>
    </View>
  );
}

/** 사진 자리표시: 카드색 바탕 + 식단(그릇)·헬스(덤벨) 아이콘 */
export function PhotoTile({
  kind,
  iconSize = 32,
  style,
}: {
  kind: 'meal' | 'gym';
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const Icon = kind === 'gym' ? Dumbbell : Utensils;
  return (
    <View style={[styles.tile, style]}>
      <Icon size={iconSize} color={c.faint} strokeWidth={1.6} />
    </View>
  );
}

/** 게시물 사진: 친구가 백업해 둔 끼니 사진이 있으면 그 사진, 없거나 못 받으면 자리표시 */
export function PostPhoto({
  post,
  iconSize,
  style,
}: {
  post: FriendPost;
  iconSize?: number;
  style: StyleProp<ViewStyle & ImageStyle>;
}) {
  const source = usePhotoSource(post);
  const [failed, setFailed] = useState<string | null>(null); // 받지 못한 게시물 id (게시물이 바뀌면 다시 시도)
  const styles = useThemedStyles(makeStyles);
  if (!source || failed === post.id) return <PhotoTile kind={post.kind} iconSize={iconSize} style={style} />;
  return (
    <Image
      source={source}
      style={[styles.tile, style]}
      resizeMode="cover"
      onError={() => setFailed(post.id)}
      accessibilityIgnoresInvertColors
    />
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    avatar: { backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
    letter: { fontFamily: fonts.semibold, color: c.text },
    tile: { backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
  });
