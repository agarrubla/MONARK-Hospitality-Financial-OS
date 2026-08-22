/**
 * Live reports — P&L (accrual), cash flow, and the accrual-vs-cash bridge,
 * all computed from what the user has entered.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { card, EmptyState, Header, SectionLabel } from '../../components/ui';
import {
  cashOutByMonth, expensesByCategory, expensesByMonth, invoiceTotal, money,
  monthLabel, monthOf, revenueByMonth, todayISO, useStore,
} from '../../store/store';
import { colors, fMono, fSans } from '../../theme/tokens';

export default function LiveReportsScreen() {
  const { data } = useStore();
  const thisMonth = monthOf(todayISO());

  const months = useMemo(() => {
    const set = new Set<string>([thisMonth]);
    data.invoices.forEach((i) => set.add(monthOf(i.expenseDate)));
    data.payments.forEach((p) => set.add(monthOf(p.date)));
    data.posDays.forEach((p) => set.add(monthOf(p.date)));
    // Continuous range from the earliest data month to today — no gaps.
    const sorted = [...set].sort();
    const first = sorted[0] ?? thisMonth;
    const out: string[] = [];
    let [y, mo] = first.split('-').map(Number);
    const [cy, cm] = thisMonth.split('-').map(Number);
    while (y! < cy! || (y === cy && mo! <= cm!)) {
      out.push(`${y}-${String(mo).padStart(2, '0')}`);
      mo!++;
      if (mo! > 12) { mo = 1; y!++; }
    }
    return out.reverse();
  }, [data, thisMonth]);

  const [month, setMonth] = useState(thisMonth);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [view, setView] = useState<'pl' | 'cash' | 'avc'>('pl');

  const revenue = revenueByMonth(data).get(month) ?? 0;
  const expenses = expensesByMonth(data).get(month) ?? 0;
  const profit = revenue - expenses;
  const cashOut = cashOutByMonth(data).get(month) ?? 0;
  const byCat = expensesByCategory(data, month);
  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? 'Otros';

  const unpaidThisMonth = data.invoices
    .filter((i) => ['approved', 'scheduled'].includes(i.status) && monthOf(i.expenseDate) === month)
    .reduce((a, i) => a + invoiceTotal(i), 0);
  const paidHereExpensedElsewhere = data.payments
    .filter((p) => {
      if (monthOf(p.date) !== month) return false;
      const inv = data.invoices.find((i) => i.id === p.invoiceId);
      return inv && monthOf(inv.expenseDate) !== month;
    })
    .reduce((a, p) => a + p.amount, 0);

  const hasData = data.invoices.length > 0 || data.posDays.length > 0;

  const line = (label: string, v: number, opts: { strong?: boolean; top?: boolean; color?: string; last?: boolean } = {}) => (
    <View key={label} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 10, borderBottomWidth: opts.last ? 0 : 1, borderBottomColor: colors.divider, borderTopWidth: opts.top ? 1.5 : 0, borderTopColor: colors.text }}>
      <Text style={{ ...fSans(opts.strong ? 600 : 500, 12.5), color: colors.text, flex: 1 }}>{label}</Text>
      <Text style={{ ...fMono(600, 13), color: opts.color ?? colors.text }}>{money(v)}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg }}>
      <Header title="REPORTES" sub={`Con tus datos · ${monthLabel(month)}${data.periods.some((pr) => pr.month.startsWith(month) && pr.status === 'locked') ? ' · 🔒 mes cerrado' : ''}`} />

      <View style={{ backgroundColor: colors.ink, paddingHorizontal: 14, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pressable onPress={() => setPickerOpen(true)} style={{ borderRadius: 6, paddingVertical: 5, paddingHorizontal: 9, backgroundColor: colors.inkSecondary }}>
            <Text style={{ fontSize: 12, color: colors.gold }}>📅</Text>
          </Pressable>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingBottom: 2 }}>
          {months.map((m) => {
            const on = month === m;
            return (
              <Pressable key={m} onPress={() => setMonth(m)} style={{ borderRadius: 6, paddingVertical: 5, paddingHorizontal: 9, backgroundColor: on ? colors.gold : colors.inkSecondary }}>
                <Text style={{ ...fMono(600, 10, 0.03), color: on ? colors.ink : colors.headerMuted }}>{monthLabel(m)}</Text>
              </Pressable>
            );
          })}
          </ScrollView>
        </View>
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
          {([['pl', 'P&L'], ['cash', 'CAJA'], ['avc', 'DEVENGO VS CAJA']] as const).map(([id, label]) => {
            const on = view === id;
            return (
              <Pressable key={id} onPress={() => setView(id)} style={{ borderRadius: 6, paddingVertical: 5, paddingHorizontal: 9, backgroundColor: on ? colors.gold : colors.inkSecondary }}>
                <Text style={{ ...fMono(600, 10, 0.03), color: on ? colors.ink : colors.headerMuted }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 14 }}>
        {!hasData && (
          <EmptyState
            icon="▤"
            title="Todavía no hay nada que reportar"
            body="Registra ventas en POS y facturas en AP; estos reportes se calculan solos con tus números."
          />
        )}

        {view === 'pl' && (
          <>
            <View style={{ ...card, paddingVertical: 4, paddingHorizontal: 14 }}>
              {line('Ingresos (ventas)', revenue)}
              {[...byCat.entries()].map(([catId, v]) => line(catName(catId), -v))}
              {line('Resultado', profit, { strong: true, top: true, color: profit >= 0 ? colors.green : colors.red, last: true })}
            </View>
            <Text style={{ ...fSans(400, 10), lineHeight: 15, color: colors.muted, paddingHorizontal: 2 }}>
              Base devengo: gastos por fecha de gasto, ingresos por día de venta. Pagar una factura en otro mes no la mueve de aquí.
            </Text>
          </>
        )}

        {view === 'cash' && (
          <>
            <View style={{ ...card, paddingVertical: 4, paddingHorizontal: 14 }}>
              {line('Salidas de caja (pagos)', -cashOut, { color: cashOut ? colors.red : colors.text })}
              {line('Entradas de caja', 0, { last: true })}
            </View>
            <Text style={{ ...fSans(400, 10), lineHeight: 15, color: colors.muted, paddingHorizontal: 2 }}>
              Base caja: solo pagos por su fecha de pago. Las entradas de caja (depósitos del banco) se activan cuando conectes tu banco — por ahora las ventas son ingreso devengado, no caja confirmada.
            </Text>
          </>
        )}

        {view === 'avc' && (
          <>
            <View style={{ backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16 }}>
              <Text style={{ ...fSans(600, 9, 0.12), color: colors.gold, marginBottom: 8 }}>POR QUÉ DIFIEREN</Text>
              <Text style={{ ...fSans(400, 11), lineHeight: 17.6, color: '#c7d4cd' }}>
                El devengo responde "¿ganamos plata este mes?"; la caja responde "¿a dónde se fue la plata?". Cada factura cuenta una sola vez en cada lado — en fechas distintas.
              </Text>
            </View>
            <View style={{ ...card, paddingVertical: 4, paddingHorizontal: 14 }}>
              {line('Resultado (devengo)', profit, { strong: true })}
              {line('+ Facturas del mes aún sin pagar', unpaidThisMonth, { color: unpaidThisMonth ? colors.green : colors.text })}
              {line('− Pagado este mes de gastos de otros meses', -paidHereExpensedElsewhere, { color: paidHereExpensedElsewhere ? colors.red : colors.text })}
              {line('Salida de caja del mes', -cashOut, { top: true, strong: true, last: true, color: cashOut ? colors.red : colors.text })}
            </View>
          </>
        )}
      </ScrollView>
      {pickerOpen && (
        <Pressable
          onPress={() => setPickerOpen(false)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,32,25,0.55)', justifyContent: 'center', padding: 24 }}
        >
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.card, borderRadius: 16, padding: 16, maxHeight: '80%' }}>
            <Text style={{ ...fSans(600, 13), color: colors.text, marginBottom: 10 }}>Elige el mes</Text>
            <ScrollView>
              {[...new Set(months.map((m) => m.slice(0, 4)))].map((year) => (
                <View key={year} style={{ marginBottom: 12 }}>
                  <Text style={{ ...fMono(600, 11, 0.06), color: colors.textSecondary2, marginBottom: 6 }}>{year}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {months.filter((m) => m.startsWith(year)).map((m) => {
                      const on = month === m;
                      return (
                        <Pressable
                          key={m}
                          onPress={() => { setMonth(m); setPickerOpen(false); }}
                          style={{ borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: on ? colors.ink : colors.appBg, borderWidth: 1, borderColor: on ? colors.ink : colors.cardBorder }}
                        >
                          <Text style={{ ...fMono(600, 11), color: on ? colors.gold : colors.text }}>{monthLabel(m)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      )}
    </View>
  );
}
