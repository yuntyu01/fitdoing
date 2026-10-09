import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePalette, useThemedStyles, type Palette } from './theme';
import { fonts, layout, radius } from './tokens';

const BAR_H = 64;
const ICON = 24;
const MIN_BOTTOM = 8; // 화면 아래 끝에서 최소한 띄우는 만큼
// 홈 인디케이터·제스처 영역(안전 영역 아래)과 일부 겹쳐도 되므로 그만큼 내린다: 안전 영역 34면 아래에서 22
const INSET_OVERLAP = 12;

const bottomGap = (insetBottom: number) => Math.max(insetBottom - INSET_OVERLAP, MIN_BOTTOM);

/** 화면 아래 끝에서 탭바 위쪽까지. 탭 화면은 스크롤 끝 여백과 떠 있는 버튼 위치를 이만큼 올린다. */
export function useTabBarSpace(): number {
  return BAR_H + bottomGap(useSafeAreaInsets().bottom);
}

/**
 * 하단 탭바. 좌우·아래가 들어간 둥근 카드(카드와 같은 좌우 여백 14)가 화면 내용 위에 떠 있다 — 뒤에 배경 띠가 없어
 * 내용이 탭바 옆·아래로 지나간다. 탭 화면은 useTabBarSpace()만큼 스크롤 끝 여백을 둔다.
 * 아이콘 + 이름 묶음이 막대 높이 가운데에 온다. 고른 탭만 글자색으로 밝게.
 */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.outer, { paddingBottom: bottomGap(insets.bottom) }]} pointerEvents="box-none">
      <View style={styles.bar}>
        {state.routes.map((route, i) => {
          const { options } = descriptors[route.key];
          const focused = state.index === i;
          const color = focused ? c.text : c.sub;
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
              style={styles.item}
            >
              {options.tabBarIcon?.({ focused, color, size: ICON })}
              <Text style={[styles.label, { color }, focused && styles.labelOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    outer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: layout.screen },
    // 내용 위에 떠 있어서 같은 카드색 위를 지날 때도 구분되게 얇은 테두리 (그림자는 쓰지 않는다)
    bar: {
      height: BAR_H,
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: radius.block * 2,
      backgroundColor: c.card,
      borderWidth: layout.hairline,
      borderColor: c.border,
    },
    // 아이콘(24) + 4 + 이름(14) 묶음을 막대 높이 가운데에
    item: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 4 },
    label: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14 },
    labelOn: { fontFamily: fonts.semibold },
  });
