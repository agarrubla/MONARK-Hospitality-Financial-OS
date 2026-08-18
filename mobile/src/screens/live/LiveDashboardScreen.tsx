/**
 * Live dashboard — computed ONLY from data the user has entered.
 * Starts empty; first run asks for the first location.
 */
import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { card, EmptyState, Field, Header, PrimaryButton, SectionLabel } from '../../components/ui';
import {
  cashOutByMonth, expensesByMonth, invoiceTotal, money, monthLabel, monthOf,
  openAP, revenueByMonth, todayISO, useStore,
} from '../../store/store';
import { colors, fMono, fSans } from '../../theme/tokens';

export default function LiveDashboardScreen() {
  const { data, ready, addLocation } = useStore();
  const [locName, setLocName] = useState('');
  const [locCode, setLocCode] = useState('');

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.appBg }} />;

  const today = todayISO();
  const thisMonth = monthOf(today);

  if (data.locations.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.appBg }}>
        <Header title="MONARK" sub="Bienvenido · configura tu primer local" />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          <View style={{ backgroundColor: colors.ink, borderRadius: 14, padding: 18 }}>
            <Text style={{ ...fSans(600, 9.5, 0.14), color: colors.gold, marginBottom: 8 }}>EMPEZAR</Text>
            <Text style={{ ...fSans(400, 12), lineHeight: 18, color: '#c7d4cd' }}>
              La app arranca vacía: registra tu primer local y empieza a cargar ventas, facturas y pagos. Todo se guarda en este dispositivo. Cada número que veas saldrá de lo que tú registres.
            </Text>
          </View>
          <View style={{ ...card, padding: 16 }}>
            <SectionLabel>TU PRIMER LOCAL</SectionLabel>
            <Field label="NOMBRE" value={locName} onChange={setLocName} placeholder="p. ej. La Cabaña Centro" />
            <Field label="CÓDIGO CORTO" value={locCode} onChange={setLocCode} placeholder="p. ej. CENTRO" mono />
            <PrimaryButton
              label="Crear local"
              disabled={!locName.trim() || !locCode.trim()}
              onPress={() => {
                addLocation(locName.trim(), locCode.trim());
                setLocName('');
                setLocCode('');
              }}
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  const revenue = revenueByMonth(data).get(thisMonth) ?? 0;
  const expenses = expensesByMonth(data).get(thisMonth) ?? 0;
  const profit = revenue - expenses;
  const cashOut = cashOutByMonth(data).get(thisMonth) ?? 0;
  const open = openAP(data);
  const openTotal = open.reduce((a, i) => a + invoiceTotal(i), 0);
  const pending = data.invoices.filter((i) => i.status === 'pending_approval').length;
  const todaySales = data.posDays.filter((p) => p.date === today).reduce((a, p) => a + (p.gross - p.discounts), 0);
  const hasAnyData = data.invoices.length > 0 || data.posDays.length > 0;

  const stat = (label: string, val: string, sub: string, color?: string) => (
    <View key={label} style={{ ...card, flex: 1, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 11 }}>
      <Text style={{ ...fSans(500, 10), color: colors.textSecondary2 }}>{label}</Text>
      <Text style={{ ...fMono(600, 18, -0.02), color: color ?? colors.text, marginTop: 3 }}>{val}</Text>
      <Text style={{ ...fSans(400, 10.5), color: colors.muted, marginTop: 2 }}>{sub}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg }}>
      <Header title="MONARK" sub={`${data.locations.map((l) => l.code).join(' · ')} · ${today}`} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 16 }}>
        {!hasAnyData && (
          <EmptyState
            icon="◈"
            title="Sin movimientos todavía"
            body="Registra ventas del día en POS y tus facturas en AP — este panel se llena solo con tus números."
          />
        )}

        <View>
          <SectionLabel>{'HOY · ' + today}</SectionLabel>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {stat('Ventas de hoy', money(todaySales), todaySales ? 'desde POS' : 'sin ventas registradas hoy')}
            {stat('Por aprobar', String(pending), pending === 1 ? 'factura esperando' : 'facturas esperando', pending ? colors.amber : colors.text)}
          </View>
        </View>

        <View>
          <SectionLabel>{'MES EN CURSO · ' + monthLabel(thisMonth)}</SectionLabel>
          <View style={{ ...card, paddingVertical: 4, paddingHorizontal: 14 }}>
            {[
              ['Ingresos (ventas POS)', revenue, colors.text],
              ['Gastos (facturas, mes de gasto)', -expenses, colors.text],
              ['Resultado', profit, profit >= 0 ? colors.green : colors.red],
            ].map(([label, v, color], i, arr) => (
              <View key={label as string} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 10, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: colors.divider, borderTopWidth: i === arr.length - 1 ? 1.5 : 0, borderTopColor: colors.text }}>
                <Text style={{ ...fSans(i === arr.length - 1 ? 600 : 500, 12.5), color: colors.text, flex: 1 }}>{label as string}</Text>
                <Text style={{ ...fMono(600, 13), color: color as string }}>{money(v as number)}</Text>
              </View>
            ))}
          </View>
          <Text style={{ ...fSans(400, 10), lineHeight: 15, color: colors.muted, marginTop: 6, marginHorizontal: 2 }}>
            Base devengo: cada factura cuenta en su mes de gasto, se pague cuando se pague.
          </Text>
        </View>

        <View>
          <SectionLabel>CUENTAS POR PAGAR Y CAJA</SectionLabel>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {stat('AP abierto', money(openTotal), open.length + ' facturas aprobadas sin pagar')}
            {stat('Salidas de caja · mes', money(cashOut), 'pagos por fecha de pago')}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
