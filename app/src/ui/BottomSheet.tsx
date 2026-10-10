import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Dimensions, Keyboard, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePalette, useThemedStyles, type Palette } from './theme';
import { layout, text } from './tokens';

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /**
   * 내용의 빈 곳을 누르면 키보드를 내린다(입력칸이 있는 시트용, 기본 켜짐). 휠처럼 끄는 동작이 있는 시트는 끈다:
   * 내용을 Pressable 로 감싸면 안드로이드에서 스크롤과 터치를 서로 가져가려다 휠이 버벅이거나 멈춘다.
   */
  dismissKeyboardOnTap?: boolean;
}

/** 바탕은 서서히 어두워지고 시트는 아래에서 올라온다. 손잡이 + 제목 + 닫기(X). 닫으면(바깥·X·뒤로) 바꾼 값은 버린다. */
export function BottomSheet({ visible, onClose, title, children, dismissKeyboardOnTap = true }: Props) {
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
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

  const body = (
    <>
      <View style={styles.handle} />
      {title ? (
        <View style={styles.head}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="close">
            <X size={24} color={c.text} strokeWidth={1.8} />
          </Pressable>
        </View>
      ) : null}
      {children}
    </>
  );

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
            { bottom: keyboard, paddingBottom: (keyboard ? 12 : insets.bottom) + 16, transform: [{ translateY }] },
          ]}
        >
          {/* 입력 밖을 누르면 키보드를 내린다 */}
          {dismissKeyboardOnTap ? (
            <Pressable onPress={Keyboard.dismiss} accessible={false}>
              {body}
            </Pressable>
          ) : (
            <View>{body}</View>
          )}
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

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    fill: { flex: 1 },
    backdrop: { backgroundColor: c.scrim },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      backgroundColor: c.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: layout.page,
      paddingTop: 8,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      marginBottom: 16,
    },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 },
    title: { ...text.title, fontSize: 22, lineHeight: 28, color: c.text, flexShrink: 1 },
  });
