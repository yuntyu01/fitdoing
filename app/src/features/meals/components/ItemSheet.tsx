import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '../../../ui/BottomSheet';
import { FullButton } from '../../../ui/FullButton';
import { usePalette, useThemedStyles, type Palette } from '../../../ui/theme';
import { fonts, layout, radius, text } from '../../../ui/tokens';

export interface FoodItem {
  name: string;
  amount: string;
}

interface Props {
  visible: boolean;
  initial: FoodItem | null; // null이면 새로 추가
  onClose: () => void;
  onSave: (item: FoodItem) => void;
  onDelete?: () => void;
}

/** 음식 이름·양을 바텀시트로 입력한다. */
export function ItemSheet({ visible, initial, onClose, onSave, onDelete }: Props) {
  const { t } = useTranslation();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={initial ? t('review.editItem') : t('review.addItem')}>
      <ItemForm initial={initial} onSave={onSave} onDelete={onDelete} />
    </BottomSheet>
  );
}

// 시트가 열릴 때마다 새로 만들어져서 입력 상태가 initial로 시작한다.
function ItemForm({ initial, onSave, onDelete }: Pick<Props, 'initial' | 'onSave' | 'onDelete'>) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial?.amount ?? '');
  return (
    <View style={styles.body}>
      <View style={styles.fields}>
        <Field
          label={t('review.itemName')}
          value={name}
          onChange={setName}
          placeholder={t('review.itemNamePlaceholder')}
          autoFocus
        />
        <Field
          label={t('review.itemAmount')}
          value={amount}
          onChange={setAmount}
          placeholder={t('review.itemAmountPlaceholder')}
        />
      </View>
      <View style={styles.buttons}>
        <FullButton
          label={t('common.save')}
          disabled={name.trim() === ''}
          onPress={() => onSave({ name: name.trim(), amount: amount.trim() })}
        />
        {initial && onDelete ? <FullButton variant="text" label={t('review.delete')} onPress={onDelete} /> : null}
      </View>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const c = usePalette();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.box}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={c.faint}
          autoFocus={autoFocus}
          maxLength={40}
          style={styles.input}
          selectionColor={c.text}
          accessibilityLabel={label}
        />
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    body: { gap: layout.block },
    fields: { gap: 20 },
    buttons: { gap: layout.related },
    field: { gap: layout.related },
    label: { ...text.caption, color: c.sub },
    box: {
      height: 52,
      borderRadius: radius.field,
      borderWidth: layout.hairline,
      borderColor: c.border,
      backgroundColor: c.card,
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    input: { fontFamily: fonts.medium, fontSize: 17, color: c.text, padding: 0 },
  });
