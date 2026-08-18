/**
 * Module dock — the app-level navigation between MONARK's 14 modules.
 * A slim ink bar (per the design tokens: #0f2019 surface, gold active state)
 * that sits below each module's own white view-tab bar, so module screens
 * stay pixel-perfect to the handoff prototypes.
 */
import React, { useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { colors, fMono } from '../theme/tokens';

export interface ModuleDef {
  key: string;
  label: string;
  icon: string;
}

export function ModuleDock({
  modules,
  activeKey,
  onSelect,
}: {
  modules: readonly ModuleDef[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  return (
    <View style={{ backgroundColor: colors.ink, borderTopWidth: 1, borderTopColor: colors.inkSecondary }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 7, paddingBottom: 6, gap: 2 }}
      >
        {modules.map((m) => {
          const active = m.key === activeKey;
          return (
            <Pressable
              key={m.key}
              onPress={() => onSelect(m.key)}
              style={{
                alignItems: 'center',
                paddingVertical: 4,
                paddingHorizontal: 9,
                borderRadius: 8,
                backgroundColor: active ? colors.inkSecondary : 'transparent',
              }}
            >
              <Text style={{ fontSize: 13, lineHeight: 14, color: active ? colors.gold : colors.headerMuted }}>
                {m.icon}
              </Text>
              <Text style={{ ...fMono(600, 7.5, 0.06), color: active ? colors.gold : colors.headerMuted, marginTop: 2 }}>
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
