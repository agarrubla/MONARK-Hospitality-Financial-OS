/**
 * Alertas — detectores del sistema (duplicados, diferencias de depósitos,
 * anomalías). Cada alerta trae su evidencia y se cierra con una decisión
 * humana: atendida o descartada.
 */
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { card, EmptyState, Header } from '../../components/ui';
import { useStore } from '../../store/store';
import { colors, fSans } from '../../theme/tokens';

const SEVERITY: Record<string, [string, string, string]> = {
  info: ['INFO', '#14584a', '#eaf3ee'],
  warning: ['REVISAR', '#8a6d1a', '#f6efdc'],
  critical: ['CRÍTICO', '#8a2f22', '#f6e9e7'],
};

const KIND: Record<string, string> = {
  duplicate_risk: 'Posible duplicado',
  deposit_variance: 'Diferencia en depósito',
  anomaly: 'Anomalía',
  price_increase: 'Aumento de precio',
  cash_risk: 'Riesgo de caja',
  budget_variance: 'Variación vs presupuesto',
  recommendation: 'Recomendación',
};

export default function LiveInsightsScreen() {
  const { data, setInsightStatus, busy } = useStore();

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg }}>
      <Header title="ALERTAS" sub="Detectores del sistema · tú decides" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 8 }}>
        {data.insights.length === 0 ? (
          <EmptyState
            icon="◎"
            title="Sin alertas abiertas"
            body="Los detectores vigilan duplicados, diferencias en depósitos y anomalías cada hora. Cuando encuentren algo, aparece aquí con su evidencia."
          />
        ) : (
          data.insights.map((a) => {
            const [label, color, bg] = SEVERITY[a.severity] ?? SEVERITY.info!;
            return (
              <View key={a.id} style={{ ...card, paddingVertical: 12, paddingHorizontal: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ ...fSans(600, 12.5), color: colors.text, flex: 1 }}>
                    {KIND[a.kind] ?? a.kind}
                  </Text>
                  <View style={{ backgroundColor: bg, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ ...fSans(600, 8.5, 0.08), color }}>{label}</Text>
                  </View>
                </View>
                <Text style={{ ...fSans(400, 11.5), lineHeight: 17, color: colors.textSecondary2, marginTop: 4 }}>
                  {a.body}
                </Text>
                <Text style={{ ...fSans(400, 10), color: colors.muted, marginTop: 3 }}>
                  {a.createdAt.slice(0, 10)} · confianza {Math.round(a.confidence * 100)}%
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <Pressable
                    onPress={() => { void setInsightStatus(a.id, 'actioned').catch(() => {}); }}
                    disabled={busy}
                    style={{ flex: 1, borderRadius: 8, paddingVertical: 9, alignItems: 'center', backgroundColor: colors.ink }}
                  >
                    <Text style={{ ...fSans(600, 11.5), color: colors.gold }}>Ya lo atendí</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { void setInsightStatus(a.id, 'dismissed').catch(() => {}); }}
                    disabled={busy}
                    style={{ flex: 1, borderRadius: 8, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: colors.cardBorder }}
                  >
                    <Text style={{ ...fSans(600, 11.5), color: colors.textSecondary2 }}>Descartar</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
        <Text style={{ ...fSans(400, 10), lineHeight: 15, color: colors.muted, marginTop: 6, marginHorizontal: 2 }}>
          Los detectores corren cada hora sobre tus datos: facturas casi idénticas del mismo proveedor, depósitos que no llegan completos, y débitos repetidos entre cuentas.
        </Text>
      </ScrollView>
    </View>
  );
}
