/**
 * Live AP — the user's real invoices. Create → approve/reject/hold →
 * Treasury pays. The invoice's EXPENSE DATE decides its P&L month.
 */
import React, { useState } from 'react';
import { Platform } from 'react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  card, ChoiceChips, EmptyState, Field, GhostButton, Header, PrimaryButton, SectionLabel,
} from '../../components/ui';
import {
  invoiceTotal, money, monthLabel, monthOf, todayISO, useStore, type Invoice, type InvoiceStatus,
} from '../../store/store';
import { colors, fMono, fSans } from '../../theme/tokens';

const statusMeta: Record<InvoiceStatus, [string, string, string]> = {
  pending_approval: ['POR APROBAR', '#b07c1e', '#fdf6ec'],
  approved: ['APROBADA', '#14584a', '#eaf3ee'],
  paid: ['PAGADA', '#5c6b64', '#f0efe9'],
  rejected: ['RECHAZADA', '#b3402e', '#faeeeb'],
  on_hold: ['EN PAUSA', '#b3402e', '#faeeeb'],
};

function Badge({ status }: { status: InvoiceStatus }) {
  const [label, c, bg] = statusMeta[status];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 4, paddingVertical: 2.5, paddingHorizontal: 6 }}>
      <Text style={{ ...fSans(600, 8.5, 0.04), color: c }}>{label}</Text>
    </View>
  );
}

const num = (s: string): number => {
  const n = parseFloat(s.replace(/\./g, (m, i, str) => (str.indexOf(',') > -1 ? '' : m)).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

export default function LiveAPScreen() {
  const { data, addInvoice, setInvoiceStatus, busy, lastError, extractInvoice } = useStore();
  const [view, setView] = useState<'list' | 'new' | 'detail'>('list');
  const [invId, setInvId] = useState<string | null>(null);

  // New-invoice form state
  const [vendorId, setVendorId] = useState('');
  const [newVendor, setNewVendor] = useState('');
  const [number, setNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayISO());
  const [expenseDate, setExpenseDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState('');
  const [categoryId, setCategoryId] = useState(data.categories[0]?.id ?? '');
  const [locationId, setLocationId] = useState(data.locations[0]?.id ?? '');
  const [description, setDescription] = useState('');
  const [subtotal, setSubtotal] = useState('');
  const [tax, setTax] = useState('');
  const [aiInfo, setAiInfo] = useState<string>('');

  const readWithAI = () => {
    const g = globalThis as unknown as { document?: any };
    if (!g.document) return;
    const input = g.document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) { setAiInfo('El archivo es muy grande (máx 8MB).'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result);
        const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        const mime = file.type || 'application/pdf';
        setAiInfo('Leyendo la factura con IA…');
        extractInvoice(base64, mime)
          .then((p) => {
            if (!p.legible) { setAiInfo('La IA no pudo leer este documento como factura — carga los datos a mano.'); return; }
            const vendorMatch = data.vendors.find((v) => p.vendor_name && v.name.toLowerCase() === p.vendor_name.toLowerCase());
            if (vendorMatch) { setVendorId(vendorMatch.id); setNewVendor(''); }
            else if (p.vendor_name) { setVendorId(''); setNewVendor(p.vendor_name); }
            if (p.invoice_number) setNumber(p.invoice_number);
            if (p.invoice_date) { setInvoiceDate(p.invoice_date); setExpenseDate(p.invoice_date); }
            if (p.due_date) setDueDate(p.due_date);
            if (p.subtotal != null) setSubtotal(String(p.subtotal));
            if (p.tax != null) setTax(String(p.tax));
            if (p.description) setDescription(p.description);
            const cat = data.categories.find((c) => p.category_name && c.name === p.category_name);
            if (cat) setCategoryId(cat.id);
            setAiInfo(`IA leyó la factura · confianza ${Math.round(p.confidence * 100)}% · revisa cada campo antes de guardar${p.notes ? ` · ojo: ${p.notes}` : ''}`);
          })
          .catch(() => setAiInfo('No se pudo leer la factura — intenta con una foto más clara o carga a mano.'));
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const d = data.invoices.find((i) => i.id === invId);
  const vendorName = (id: string) => data.vendors.find((v) => v.id === id)?.name ?? '—';
  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? '—';
  const locCode = (id: string) => data.locations.find((l) => l.id === id)?.code ?? '—';

  const resetForm = () => {
    setNumber(''); setSubtotal(''); setTax(''); setDescription(''); setNewVendor('');
    setInvoiceDate(todayISO()); setExpenseDate(todayISO()); setDueDate('');
  };

  const canSave =
    (vendorId || newVendor.trim()) && (categoryId || data.categories.length === 0) && number.trim() && /^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(expenseDate) && !Number.isNaN(num(subtotal || '0')) && num(subtotal) > 0 &&
    (tax === '' || !Number.isNaN(num(tax))) && (data.locations.length === 0 || locationId);

  const save = () => {
    addInvoice({
      vendorId: vendorId || undefined,
      vendorName: vendorId ? undefined : newVendor.trim(),
      locationId: locationId || data.locations[0]?.id || '',
      number: number.trim(),
      invoiceDate,
      expenseDate,
      dueDate: dueDate || invoiceDate,
      categoryId,
      description: description.trim(),
      subtotal: num(subtotal),
      tax: tax === '' ? 0 : num(tax),
    })
      .then(() => { resetForm(); setView('list'); })
      .catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg }}>
      <Header
        title={view === 'new' ? 'NUEVA FACTURA' : view === 'detail' ? 'FACTURA' : 'CUENTAS POR PAGAR'}
        sub={view === 'detail' && d ? `${d.number} · ${vendorName(d.vendorId)}` : 'Tus facturas reales · base devengo'}
        onBack={view !== 'list' ? () => setView('list') : undefined}
      />

      {view === 'list' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 12 }}>
          <PrimaryButton label="+ Registrar factura" onPress={() => setView('new')} />
          {data.invoices.length === 0 ? (
            <EmptyState
              icon="▤"
              title="Aún no hay facturas"
              body="Registra tu primera factura de proveedor. Su fecha de gasto decide en qué mes pega al P&L — se pague cuando se pague."
            />
          ) : (
            <View style={{ gap: 8 }}>
              {data.invoices.map((i) => (
                <Pressable key={i.id} onPress={() => { setInvId(i.id); setView('detail'); }} style={{ ...card, paddingVertical: 12, paddingHorizontal: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={{ ...fSans(600, 12.5), color: colors.text, flex: 1 }} numberOfLines={1}>{vendorName(i.vendorId)}</Text>
                    <Text style={{ ...fMono(600, 13), color: colors.text }}>{money(invoiceTotal(i))}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 }}>
                    <Badge status={i.status} />
                    <Text style={{ ...fSans(400, 10.5), color: colors.muted, flex: 1 }} numberOfLines={1}>
                      {i.source === 'email_capture' ? '✉ correo · ' : ''}{i.number} · {locCode(i.locationId)} · gasto {monthLabel(monthOf(i.expenseDate))}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {view === 'new' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
          {Platform.OS === 'web' && (
            <Pressable
              onPress={readWithAI}
              disabled={busy}
              style={{ borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.ink, marginBottom: 10 }}
            >
              <Text style={{ ...fSans(600, 12.5), color: colors.gold }}>
                {busy ? 'Leyendo…' : '◇ Leer factura con IA (foto o PDF)'}
              </Text>
            </Pressable>
          )}
          {!!aiInfo && (
            <View style={{ backgroundColor: '#eaf3ee', borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <Text style={{ ...fSans(500, 11), lineHeight: 16.5, color: colors.green }}>{aiInfo}</Text>
            </View>
          )}
          <View style={{ ...card, padding: 16 }}>
            <SectionLabel>PROVEEDOR</SectionLabel>
            {data.vendors.length > 0 && (
              <ChoiceChips
                options={[...data.vendors.map((v) => [v.id, v.name] as [string, string]), ['', '+ Nuevo']]}
                value={vendorId}
                onChange={setVendorId}
              />
            )}
            {!vendorId && (
              <Field label="NOMBRE DEL PROVEEDOR" value={newVendor} onChange={setNewVendor} placeholder="p. ej. Distribuidora El Roble" />
            )}
            <Field label="NÚMERO DE FACTURA" value={number} onChange={setNumber} placeholder="p. ej. F-00123" mono />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="FECHA FACTURA" value={invoiceDate} onChange={setInvoiceDate} placeholder="AAAA-MM-DD" mono />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="FECHA DE GASTO (P&L)" value={expenseDate} onChange={setExpenseDate} placeholder="AAAA-MM-DD" mono />
              </View>
            </View>
            <Field label="VENCE (OPCIONAL)" value={dueDate} onChange={setDueDate} placeholder="AAAA-MM-DD" mono />
            <SectionLabel>CATEGORÍA</SectionLabel>
            <ChoiceChips
              options={data.categories.map((c) => [c.id, c.name] as [string, string])}
              value={categoryId}
              onChange={setCategoryId}
            />
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
            <Field label="DESCRIPCIÓN (OPCIONAL)" value={description} onChange={setDescription} placeholder="p. ej. pedido semanal de carnes" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="SUBTOTAL" value={subtotal} onChange={setSubtotal} placeholder="0.00" keyboardType="decimal-pad" mono />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="IMPUESTO" value={tax} onChange={setTax} placeholder="0.00" keyboardType="decimal-pad" mono />
              </View>
            </View>
            {!!lastError && (
              <Text style={{ ...fSans(500, 11), lineHeight: 16.5, color: colors.red, marginBottom: 8 }}>{lastError}</Text>
            )}
            <PrimaryButton label={busy ? 'Guardando…' : 'Guardar · queda Por aprobar'} onPress={save} disabled={!canSave || busy} />
            <Text style={{ ...fSans(400, 10), lineHeight: 15, color: colors.muted, marginTop: 8 }}>
              La factura entra al P&L de {/^\d{4}-\d{2}-\d{2}$/.test(expenseDate) ? monthLabel(monthOf(expenseDate)) : 'su mes de gasto'} cuando se apruebe. El pago (cuando lo registres en Treasury) afecta solo la caja de su propio mes.
            </Text>
          </View>
        </ScrollView>
      )}

      {view === 'detail' && d && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 14 }}>
          <View style={{ ...card, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ ...fSans(600, 16), color: colors.text }}>{vendorName(d.vendorId)}</Text>
                <Text style={{ ...fMono(500, 11), color: colors.textSecondary2, marginTop: 3 }}>{d.number}</Text>
              </View>
              <Badge status={d.status} />
            </View>
            <Text style={{ ...fMono(700, 26, -0.02), color: colors.text, marginTop: 12, marginBottom: 2 }}>{money(invoiceTotal(d))}</Text>
            <Text style={{ ...fSans(400, 11), color: colors.muted }}>
              Subtotal {money(d.subtotal)} + impuesto {money(d.tax)} · {catName(d.categoryId)} · {locCode(d.locationId)}
            </Text>
            {d.status === 'pending_approval' && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton label="Aprobar" onPress={() => void setInvoiceStatus(d.id, 'approved').catch(() => {})} />
                </View>
                <GhostButton label="Rechazar" danger onPress={() => void setInvoiceStatus(d.id, 'rejected').catch(() => {})} />
                <GhostButton label="Pausar" onPress={() => void setInvoiceStatus(d.id, 'on_hold').catch(() => {})} />
              </View>
            )}
            {d.status === 'on_hold' && (
              <View style={{ marginTop: 12 }}>
                <PrimaryButton label="Reactivar (Por aprobar)" onPress={() => void setInvoiceStatus(d.id, 'pending_approval').catch(() => {})} />
              </View>
            )}
          </View>

          <View style={{ backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16 }}>
            <Text style={{ ...fSans(600, 9, 0.12), color: colors.gold, marginBottom: 10 }}>
              UNA FACTURA · UN GASTO · UN PAGO
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, backgroundColor: colors.inkSecondary, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 12 }}>
                <Text style={{ ...fSans(600, 9, 0.08), color: colors.headerMuted }}>MES DE GASTO · P&L</Text>
                <Text style={{ ...fMono(600, 15), color: colors.appBg, marginTop: 4 }}>{monthLabel(monthOf(d.expenseDate))}</Text>
                <Text style={{ ...fSans(400, 9.5), color: colors.scoreSub, marginTop: 2 }}>fecha de gasto {d.expenseDate}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: colors.inkSecondary, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 12 }}>
                <Text style={{ ...fSans(600, 9, 0.08), color: colors.headerMuted }}>MES DE PAGO · CAJA</Text>
                <Text style={{ ...fMono(600, 15), color: colors.appBg, marginTop: 4 }}>
                  {d.paymentDate ? monthLabel(monthOf(d.paymentDate)) : '—'}
                </Text>
                <Text style={{ ...fSans(400, 9.5), color: colors.scoreSub, marginTop: 2 }}>
                  {d.paymentDate ? 'fecha de pago ' + d.paymentDate : 'sin pago aún — no hay evento de caja'}
                </Text>
              </View>
            </View>
          </View>

          <View>
            <SectionLabel>HISTORIAL</SectionLabel>
            <View style={{ ...card, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 6 }}>
              {d.history.map((h, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10, paddingBottom: 13 }}>
                  <View style={{ alignItems: 'center' }}>
                    <View style={{ width: 9, height: 9, borderRadius: 4.5, marginTop: 3, backgroundColor: i === 0 ? colors.gold : colors.sheetHandle }} />
                    {i < d.history.length - 1 && <View style={{ width: 1.5, flex: 1, backgroundColor: colors.cardBorder, marginTop: 3 }} />}
                  </View>
                  <View style={{ flex: 1, marginTop: -2, flexDirection: 'row', gap: 8 }}>
                    <Text style={{ ...fSans(600, 11.5), color: colors.text, flex: 1 }}>{h.action}</Text>
                    <Text style={{ ...fMono(500, 9), color: colors.faint }}>{h.when}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
