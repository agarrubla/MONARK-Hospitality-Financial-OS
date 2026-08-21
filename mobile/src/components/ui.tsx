/** Shared UI for the live (user-fed) screens — same design tokens. */
import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { colors, fMono, fSans } from '../theme/tokens';

export const card = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.cardBorder,
  borderRadius: 12,
} as const;

export function Header({ title, sub, onBack }: { title: string; sub: string; onBack?: () => void }) {
  return (
    <View style={{ backgroundColor: colors.ink, paddingTop: 14, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {onBack && (
        <Pressable onPress={onBack} style={{ backgroundColor: colors.inkSecondary, borderRadius: 8, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.gold, fontSize: 15 }}>‹</Text>
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ ...fMono(700, 15, 0.18), color: colors.appBg }} numberOfLines={1}>{title}</Text>
        <Text style={{ ...fSans(500, 10), color: colors.headerMuted, marginTop: 1 }} numberOfLines={1}>{sub}</Text>
      </View>
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return (
    <Text style={{ ...fSans(600, 10, 0.14), color: colors.textSecondary2, marginHorizontal: 2, marginBottom: 8 }}>
      {children}
    </Text>
  );
}

export function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <View style={{ ...card, paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center' }}>
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
        <Text style={{ color: colors.gold, fontSize: 20 }}>{icon}</Text>
      </View>
      <Text style={{ ...fSans(600, 13.5), color: colors.text, textAlign: 'center' }}>{title}</Text>
      <Text style={{ ...fSans(400, 11), lineHeight: 16.5, color: colors.muted, marginTop: 4, textAlign: 'center' }}>{body}</Text>
    </View>
  );
}

export function Field(props: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad';
  mono?: boolean;
  secure?: boolean;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ ...fSans(600, 10, 0.08), color: colors.textSecondary2, marginBottom: 4 }}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChange}
        placeholder={props.placeholder}
        placeholderTextColor={colors.faint}
        keyboardType={props.keyboardType ?? 'default'}
        secureTextEntry={props.secure}
        autoCapitalize={props.secure ? 'none' : undefined}
        style={{
          borderWidth: 1, borderColor: colors.sheetHandle, borderRadius: 8,
          paddingVertical: 9, paddingHorizontal: 11,
          ...(props.mono ? fMono(500, 12.5) : fSans(400, 12.5)),
          color: colors.text, backgroundColor: colors.card,
        }}
      />
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{ backgroundColor: disabled ? colors.cardBorder : colors.green, borderRadius: 9, paddingVertical: 12, alignItems: 'center' }}
    >
      <Text style={{ ...fSans(600, 12.5), color: disabled ? colors.muted : '#fff' }}>{label}</Text>
    </Pressable>
  );
}

export function GhostButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ borderWidth: 1.5, borderColor: danger ? colors.scoreLow : colors.sheetHandle, backgroundColor: colors.card, borderRadius: 9, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center' }}
    >
      <Text style={{ ...fSans(600, 12), color: danger ? colors.red : colors.textSecondary }}>{label}</Text>
    </Pressable>
  );
}

/** Chip selector row (single choice). */
export function ChoiceChips<T extends string>(props: {
  options: Array<[T, string]>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
      {props.options.map(([val, label]) => {
        const on = props.value === val;
        return (
          <Pressable
            key={val}
            onPress={() => props.onChange(val)}
            style={{ borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1.5, borderColor: on ? colors.green : colors.cardBorder, backgroundColor: on ? colors.greenBgLight : colors.card }}
          >
            <Text style={{ ...fSans(600, 11), color: on ? colors.green : colors.textSecondary2 }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
