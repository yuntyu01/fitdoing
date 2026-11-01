import type { BottomTabBarProps } from 'expo-router/js-tabs';
import type { ReactNode } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassBackground } from './glass';
import { usePop, useSlidingPill } from './motion';
import { useGlassTokens } from './theme';
import { glass } from './tokens';

const ICON = 24;

// 화면 아래 끝에서 탭바까지. iOS 는 홈 표시줄과 조금 겹쳐도 되고, Android 내비게이션 버튼은 피한다.
const bottomGap = (insetBottom: number) =>
  Math.max(glass.navMinBottom, Platform.OS === 'android' ? insetBottom : insetBottom - 8);

/** 화면 아래 끝에서 탭바 위쪽까지. 탭 화면은 스크롤 끝 여백과 떠 있는 버튼 위치를 이만큼 올린다. */
export function useTabBarSpace(): number {
  return glass.navHeight + bottomGap(useSafeAreaInsets().bottom);
}

/**
 * 하단 탭바. 화면 내용 위에 떠 있는 유리 알약으로, 뒤의 내용이 흐리게 비친다. 아이콘만 두고 이름은 접근성 라벨로 읽어 준다.
 * 고른 탭은 밝은 아이콘과 알약으로 표시하고, 탭을 바꾸면 알약이 미끄러져 옮겨 가고 새 아이콘이 살짝 튄다.
 */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const g = useGlassTokens();
  const insets = useSafeAreaInsets();
  const { onItemLayout, pill } = useSlidingPill(state.index);

  return (
    <View style={[styles.outer, { paddingBottom: bottomGap(insets.bottom) }]} pointerEvents="box-none">
      <View style={styles.bar}>
        <GlassBackground color={g.nav} alpha={g.navAlpha} />
        {pill ? (
          <Animated.View pointerEvents="none" style={[styles.pill, pill, { backgroundColor: g.navPill }]} />
        ) : null}
        {state.routes.map((route, i) => {
          const { options } = descriptors[route.key];
          const focused = state.index === i;
          const color = focused ? g.navIconOn : g.navIcon;
          const label = typeof options.title === 'string' ? options.title : route.name;
          const onPress = () => {
            const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !e.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              onLayout={onItemLayout(i)}
              hitSlop={6}
              style={styles.tab}
            >
              <Pop active={focused}>{options.tabBarIcon?.({ focused, color, size: ICON })}</Pop>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Pop({ active, children }: { active: boolean; children: ReactNode }) {
  return <Animated.View style={usePop(active)}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  outer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: glass.navSide },
  bar: {
    height: glass.navHeight,
    borderRadius: glass.navHeight / 2,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: glass.navPad,
  },
  tab: {
    width: glass.navTabW,
    flexShrink: 1, // 아주 좁은 화면에서는 탭이 줄어든다
    height: glass.navTabH,
    borderRadius: glass.navTabH / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: { top: (glass.navHeight - glass.navTabH) / 2, height: glass.navTabH, borderRadius: glass.navTabH / 2 },
});
