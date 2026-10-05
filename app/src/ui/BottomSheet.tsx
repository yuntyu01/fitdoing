import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Dimensions, Keyboard, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, space, type } from './tokens';

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/** 바탕은 서서히 어두워지고 시트는 아래에서 올라온다. */
export function BottomSheet({ visible, onClose, title, children }: Props) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const [anim] = useState(() => new Animated.Value(0));
  const keyboard = useKeyboardHeight();

  // 열릴 때는 렌더 중에 mounted를 맞춘다 (effect 안에서 setState 하지 않는다)
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() =>
        setMounted(false),
      );
    }
  }, [visible, anim, mounted]);

  if (!mounted) return null;

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [400, 0] });

  return (
    <Modal transparent visible statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: anim }]}>
          <Pressable style={styles.fill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            // Modal 안에서는 adjustResize가 안 먹으므로 키보드 높이만큼 직접 올린다.
            { bottom: keyboard, paddingBottom: (keyboard ? space.m : insets.bottom) + space.m, transform: [{ translateY }] },
          ]}
        >
          {/* 입력 밖을 누르면 키보드를 내린다 */}
          <Pressable onPress={Keyboard.dismiss} accessible={false}>
            <View style={styles.handle} />
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {children}
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    // height는 내비게이션 바를 빼고 올 때가 있어서, 화면 높이 - 키보드 윗변으로 잰다.
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setH(Math.max(e.endCoordinates.height, Dimensions.get('screen').height - e.endCoordinates.screenY)),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return h;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: space.gutter,
    paddingTop: space.s,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: space.m,
  },
  title: { ...type.heading, marginBottom: space.m },
});
