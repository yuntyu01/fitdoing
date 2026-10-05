import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '../../../ui/BottomSheet';
import { FullButton } from '../../../ui/FullButton';
import { colors, fonts, radius, space } from '../../../ui/tokens';

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
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial?.amount ?? '');
  return (
    <>
      <View style={styles.body}>
        <Field label={t('review.itemName')} value={name} onChange={setName} placeholder={t('review.itemNamePlaceholder')} autoFocus />
        <Field label={t('review.itemAmount')} value={amount} onChange={setAmount} placeholder={t('review.itemAmountPlaceholder')} />
        <FullButton label={t('common.save')} disabled={name.trim() === ''} onPress={() => onSave({ name: name.trim(), amount: amount.trim() })} />
        {initial && onDelete ? <FullButton variant="secondary" label={t('review.delete')} onPress={onDelete} /> : null}
      </View>
    </>
  );
}

function Field({ label, value, onChange, placeholder, autoFocus }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.box}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          autoFocus={autoFocus}
          maxLength={40}
          style={styles.input}
          selectionColor={colors.text}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.m },
  field: { gap: space.s },
  label: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  box: { height: 56, borderRadius: radius.tile, backgroundColor: colors.bg, justifyContent: 'center', paddingHorizontal: space.m + space.xs },
  input: { fontFamily: fonts.medium, fontSize: 17, color: colors.text, padding: 0 },
});
