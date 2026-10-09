import { Check, Minus, Plus } from 'lucide-react-native';
import { Children, Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Divider } from '../../../ui/Card';
import { usePalette, useThemedStyles, type Palette } from '../../../ui/theme';
import { fonts, layout, radius, text } from '../../../ui/tokens';

// 온보딩과 설정 편집 화면이 같이 쓰는 폼 조각. 박스 없이 배경 위에 소제목 + 내용으로 둔다.

/** 소제목(18) + 내용. right는 소제목 오른쪽(켜기 스위치 등). */
export function FormSection({
  title,
  right,
  note,
  children,
}: {
  title?: string;
  right?: ReactNode;
  note?: string;
  children?: ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.section}>
      {title ? (
        <View style={styles.headRow}>
          <Text style={styles.heading}>{title}</Text>
          {right}
        </View>
      ) : null}
      {children}
      {note ? <FormNote>{note}</FormNote> : null}
    </View>
  );
}

/** 섹션 아래 작은 안내 */
export function FormNote({ children }: { children: string }) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.note}>{children}</Text>;
}

/** 행 사이에만 1px 구분선을 넣는다 */
export function Rows({ children }: { children: ReactNode }) {
  const items = Children.toArray(children);
  return (
    <View>
      {items.map((child, i) => (
        <Fragment key={i}>
          {i > 0 ? <Divider /> : null}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

interface RadioProps {
  label: string;
  desc?: string;
  note?: string; // 이름 옆 작은 글자 ("곧 열려요")
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}

/** 하나만 고르는 목록의 한 줄. 고른 줄은 회색 채움 + 체크 동그라미, 나머지는 빈 동그라미. */
export function RadioRow({ label, desc, note, selected, disabled, onPress }: RadioProps) {
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.radio,
        selected && styles.radioOn,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.radioText}>
        <Text style={[styles.radioLabel, selected && styles.radioLabelOn]}>
          {label}
          {note ? <Text style={styles.radioNote}>{`  ${note}`}</Text> : null}
        </Text>
        {desc ? <Text style={styles.radioDesc}>{desc}</Text> : null}
      </View>
      {selected ? (
        <View style={styles.dotOn}>
          <Check size={14} color={c.bg} strokeWidth={3} />
        </View>
      ) : (
        <View style={styles.dot} />
      )}
    </Pressable>
  );
}

interface TextFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength: number;
  /** 여러 줄 입력 (비상 해제 사유). 글자 수는 칸 오른쪽 아래에 둔다. */
  multiline?: boolean;
  accessibilityLabel?: string;
}

/** 얇은 테두리 글자 입력칸 + 글자 수 "n/최대" */
export function TextField({ value, onChange, placeholder, maxLength, multiline, accessibilityLabel }: TextFieldProps) {
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.field, multiline && styles.fieldMulti]}>
      <TextInput
        value={value}
        onChangeText={(v) => onChange(v.slice(0, maxLength))}
        placeholder={placeholder}
        placeholderTextColor={c.faint}
        maxLength={maxLength}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        selectionColor={c.text}
        accessibilityLabel={accessibilityLabel ?? placeholder}
        style={[styles.input, multiline && styles.inputMulti]}
      />
      <Text style={[styles.counter, multiline && styles.counterMulti]}>{`${value.length}/${maxLength}`}</Text>
    </View>
  );
}

interface StepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  /** 가운데 값 글자 ("주 5회") */
  label: string;
  /** 한 번 누를 때 바뀌는 양 (기본 1) */
  step?: number;
}

/** − 값 + 작은 조절기. 끝에 닿으면 그쪽 버튼을 흐리게 막는다. */
export function Stepper({ value, min, max, onChange, label, step: unit = 1 }: StepperProps) {
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  const step = (d: number) => onChange(Math.min(max, Math.max(min, value + d)));
  const btn = (d: number) => {
    const off = d < 0 ? value <= min : value >= max;
    const Icon = d < 0 ? Minus : Plus;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={d < 0 ? 'decrease' : 'increase'}
        accessibilityState={{ disabled: off }}
        disabled={off}
        hitSlop={6}
        onPress={() => step(d)}
        style={({ pressed }) => [styles.stepBtn, off && styles.disabled, pressed && styles.pressed]}
      >
        <Icon size={18} color={c.text} strokeWidth={1.8} />
      </Pressable>
    );
  };
  return (
    <View style={styles.stepper} accessibilityRole="adjustable" accessibilityValue={{ text: label }}>
      {btn(-unit)}
      <Text style={styles.stepValue}>{label}</Text>
      {btn(unit)}
    </View>
  );
}

const DOT = 24;
const STEP_BTN = 36;

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    section: { gap: 12 },
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    heading: { ...text.heading, color: c.text, flexShrink: 1 },
    note: { ...text.caption, color: c.sub },
    radio: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: layout.inner,
      paddingVertical: 14,
      minHeight: 56,
      borderRadius: radius.field,
    },
    radioOn: { backgroundColor: c.selected },
    disabled: { opacity: 0.4 },
    pressed: { opacity: 0.7 },
    radioText: { flex: 1, gap: 2 },
    radioLabel: { ...text.label, color: c.text },
    radioLabelOn: { fontFamily: fonts.semibold },
    radioNote: { ...text.caption, color: c.sub },
    radioDesc: { ...text.caption, color: c.sub },
    field: {
      minHeight: 52,
      borderRadius: radius.field,
      borderWidth: layout.hairline,
      borderColor: c.border,
      backgroundColor: c.card,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: layout.inner,
    },
    fieldMulti: { flexDirection: 'column', alignItems: 'stretch', gap: 4, paddingVertical: 12 },
    input: { flex: 1, minWidth: 0, ...text.label, color: c.text, padding: 0 },
    inputMulti: { flex: 0, minHeight: 72 },
    counter: { ...text.small, color: c.sub, fontVariant: ['tabular-nums'] },
    counterMulti: { alignSelf: 'flex-end' },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    stepBtn: {
      width: STEP_BTN,
      height: STEP_BTN,
      borderRadius: radius.field,
      borderWidth: layout.hairline,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepValue: {
      ...text.body,
      fontFamily: fonts.medium,
      color: c.text,
      minWidth: 56,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 1.5, borderColor: c.faint },
    dotOn: {
      width: DOT,
      height: DOT,
      borderRadius: DOT / 2,
      backgroundColor: c.text,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
