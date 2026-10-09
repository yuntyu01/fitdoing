import { router, type Href } from 'expo-router';
import { UserPlus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { friendMenu } from '../../features/friends/actions';
import { dayHref, FeedPost } from '../../features/friends/components/FeedPost';
import { Empty, ErrorView, Loading } from '../../features/friends/components/States';
import { useFriendFeed } from '../../features/friends/data';
import type { FriendPost } from '../../features/friends/types';
import { Divider } from '../../ui/Card';
import { FullButton } from '../../ui/FullButton';
import { useTabBarSpace } from '../../ui/FloatingTabBar';
import { usePalette, useThemedStyles, type Palette } from '../../ui/theme';
import { layout, text } from '../../ui/tokens';

const manageHref = '/friends-manage' as Href;

/** 친구 탭: 친구들이 공유한 식단·헬스 인증 피드. 게시물은 상자 없이 간격과 구분선으로 나눈다. 당겨서 새로고침. */
export default function FriendsScreen() {
  const { t } = useTranslation();
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const tabSpace = useTabBarSpace(); // 떠 있는 탭바에 마지막 게시물이 가리지 않게
  const feed = useFriendFeed();

  const onMore = (post: FriendPost) =>
    friendMenu(
      t,
      { id: post.friendId, name: post.name },
      {
        onSeeDay: () => router.push(dayHref(post)),
        onRemoved: () => {}, // 끊으면 피드가 스스로 다시 불러온다 (bumpFriends)
      },
    );

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>{t('friends.title')}</Text>
      <Pressable
        onPress={() => router.push(manageHref)}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('friends.manageTitle')}
      >
        <UserPlus size={24} color={c.text} strokeWidth={1.8} />
      </Pressable>
    </View>
  );

  // 처음 불러오기 · 실패(데이터 없음) · 친구 없음 · 게시물 없음
  const empty = feed.loading ? (
    <Loading />
  ) : feed.error ? (
    <ErrorView error={feed.error} onRetry={() => void feed.refresh()} />
  ) : feed.hasFriends === false ? (
    <View style={styles.emptyWrap}>
      <Empty title={t('friends.emptyTitle')} body={t('friends.emptyBody')} />
      <FullButton variant="secondary" label={t('friends.addFriend')} onPress={() => router.push(manageHref)} />
    </View>
  ) : (
    <Empty title={t('friends.noPostsTitle')} body={t('friends.noPostsBody')} />
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={feed.posts}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <FeedPost post={item} onMore={() => onMore(item)} />}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={feed.loadingMore ? <ActivityIndicator style={styles.more} color={c.sub} /> : null}
        onEndReached={feed.loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={feed.refreshing}
            onRefresh={() => void feed.refresh()}
            tintColor={c.sub}
            colors={[c.text]}
            progressBackgroundColor={c.card}
          />
        }
        contentContainerStyle={[styles.body, { paddingBottom: tabSpace + layout.block }]}
      />
    </SafeAreaView>
  );
}

function Separator() {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.separator}>
      <Divider />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    body: { paddingHorizontal: layout.page, flexGrow: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 20,
      marginBottom: 28,
    },
    title: { ...text.title, color: c.text },
    separator: { paddingVertical: 24 },
    emptyWrap: { gap: 8 },
    more: { marginTop: 24 },
  });
