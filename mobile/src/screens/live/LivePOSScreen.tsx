/**
 * Live POS — the user's real daily sales (manual entry until a POS
 * integration is connected). One row per location per business day.
 */
import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  card, ChoiceChips, EmptyState, Field, Header, PrimaryButton, SectionLabel,
} from '../../components/ui';
import { money, monthLabel, monthOf, todayISO, useStore } from '../../store/store';
import { colors, fMono, fSans } from '../../theme/tokens';

const num = (s: string): number => {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

export default function LivePOSScreen() {
  const { data, addPosDay, busy, lastError } = useStore();
  const [view, setView] = useState<'list' | 'new'>('list');
  const [locationId, setLocationId] = useState(data.locations[0]?.id ?? '');
  const [date, setDate] = useState(todayISO());
  const [gross, setGross] = useState('');
  const [discounts, setDiscounts] = useState('');
  const [tax, setTax] = useState('');
  const [tips, setTips] = useState('');
  const [food, setFood] = useState('');
  const [bev, setBev] = useState('');

  const locCode = (id: string) => data.locations.find((l) => l.id === id)?.code ?? '—';
  const dup = data.posDays.some((p) => p.date === date && p.locationId === (locationId || data.locations[0]?.id));
  const canSave =
    /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(num(gross)) && num(gross) > 0 && !dup && !busy &&
    [discounts, tax, tips].every((s) => s === '' || !Number.isNaN(num(s)));

  const save = () => {
    addPosDay({
      locationId: locationId || data.locations[0]?.id || '',
      date,
      gross: num(gross),
      discounts: discounts === '' ? 0 : num(discounts),
      tax: tax === '' ? 0 : num(tax),
      tips: tips === '' ? 0 : num(tips),
    })
      .then(() => {
        setGross(''); setDiscounts(''); setTax(''); setTips(''); setFood(''); setBev('');
        setView('list');
      })
      .catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg }}>
      <Header
        title={view === 'new' ? 'REGISTRAR VENTAS' : 'VENTAS · POS'}
        sub="Ventas diarias por local · ingreso del negocio"
        onBack={view === 'new' ? () => setView('list') : undefined}
      />

      {view === 'list' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 12 }}>
          <PrimaryButton label="+ Registrar ventas del día" onPress={() => setView('new')} />
          {data.posDays.length === 0 ? (
            <EmptyState
              icon="◉"
              title="Sin ventas registradas"
              body="Registra el cierre de cada día (ventas brutas, descuentos, impuestos, propinas). El ingreso cuenta en el mes del día de venta."
            />
          ) : (
            <View style={{ gap: 8 }}>
              {data.posDays.map((p) => (
                <View key={p.id} style={{ ...card, paddingVertical: 12, paddingHorizontal: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={{ ...fSans(600, 12.5), color: colors.text, flex: 1 }}>
                      {locCode(p.locationId)} · {p.date}
                    </Text>
                    <Text style={{ ...fMono(600, 14), color: colors.text }}>{money(p.gross - p.discounts)}</Text>
                  </View>
                  <Text style={{ ...fSans(400, 10.5), color: colors.muted, marginTop: 3 }}>
                    bruto {money(p.gross)} · desc. {money(p.discounts)} · imp. {money(p.tax)} · propinas {money(p.tips)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {view === 'new' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
          <View style={{ ...card, padding: 16 }}>
            {data.locations.length > 1 && (
              <>
                <SectionLabel>LOCAL</SectionLabel>
                <ChoiceChips
                  options={data.locations.map((l) => [l.id, l.code] as [string, string])}
                  value={locationId}
                  onChange={setLocationId}
                />
              </>
            )}
            <Field label="DÍA DE VENTA" value={date} onChange={setDate} placeholder="AAAA-MM-DD" mono />
            {dup && (
              <Text style={{ ...fSans(500, 10.5), color: colors.red, marginTop: -4, marginBottom: 8 }}>
                Ese día ya está registrado para este local — un día de ventas nunca se registra dos veces.
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="VENTAS BRUTAS" value={gross} onChange={setGross} placeholder="0.00" keyboardType="decimal-pad" mono />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="DESCUENTOS" value={discounts} onChange={setDiscounts} placeholder="0.00" keyboardType="decimal-pad" mono />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="IMPUESTOS" value={tax} onChange={setTax} placeholder="0.00" keyboardType="decimal-pad" mono />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="PROPINAS" value={tips} onChange={setTips} placeholder="0.00" keyboardType="decimal-pad" mono />
              </View>
            </View>
            {!!lastError && (
              <Text style={{ ...fSans(500, 11), lineHeight: 16.5, color: colors.red, marginBottom: 8 }}>{lastError}</Text>
            )}
            <PrimaryButton
              label={/^\d{4}-\d{2}-\d{2}$/.test(date) ? `Guardar · ingreso de ${monthLabel(monthOf(date))}` : 'Guardar'}
              onPress={save}
              disabled={!canSave}
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}
