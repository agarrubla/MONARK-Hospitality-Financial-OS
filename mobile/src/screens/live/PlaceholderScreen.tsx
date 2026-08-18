/**
 * Placeholder for modules that need an external connection (bank feeds,
 * POS integration, AI services). No fake numbers — just what activates them.
 */
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { card, Header } from '../../components/ui';
import { colors, fSans } from '../../theme/tokens';

export default function PlaceholderScreen({ title, sub, icon, blurb, activates }: {
  title: string;
  sub: string;
  icon: string;
  blurb: string;
  activates: string;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg }}>
      <Header title={title} sub={sub} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View style={{ ...card, paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center' }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
            <Text style={{ color: colors.gold, fontSize: 20 }}>{icon}</Text>
          </View>
          <Text style={{ ...fSans(600, 13.5), color: colors.text, textAlign: 'center' }}>Módulo pendiente de conexión</Text>
          <Text style={{ ...fSans(400, 11), lineHeight: 16.5, color: colors.muted, marginTop: 4, textAlign: 'center' }}>{blurb}</Text>
        </View>
        <View style={{ backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16 }}>
          <Text style={{ ...fSans(600, 9, 0.12), color: colors.gold, marginBottom: 7 }}>SE ACTIVA CON</Text>
          <Text style={{ ...fSans(400, 11), lineHeight: 17, color: '#c7d4cd' }}>{activates}</Text>
        </View>
      </ScrollView>
    </View>
  );
}
