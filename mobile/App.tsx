import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
  IBMPlexMono_700Bold,
} from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-sans';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Platform, SafeAreaView, useWindowDimensions, View } from 'react-native';
import { ModuleDock } from './src/navigation/ModuleDock';
import LiveAPScreen from './src/screens/live/LiveAPScreen';
import LiveDashboardScreen from './src/screens/live/LiveDashboardScreen';
import LivePOSScreen from './src/screens/live/LivePOSScreen';
import LiveReportsScreen from './src/screens/live/LiveReportsScreen';
import LiveTreasuryScreen from './src/screens/live/LiveTreasuryScreen';
import PlaceholderScreen from './src/screens/live/PlaceholderScreen';
import { StoreProvider } from './src/store/store';
import { colors } from './src/theme/tokens';

const Banking = () => (
  <PlaceholderScreen
    title="BANKING" sub="Cuentas y movimientos bancarios" icon="≋"
    blurb="Aquí verás tus cuentas, saldos y cada movimiento del banco, conciliados contra tus pagos y depósitos."
    activates="Conectar tus cuentas bancarias (vía Plaid u otro agregador). Los movimientos entran solos cada mañana y se cruzan con lo que registraste — el banco es evidencia, nunca un gasto nuevo."
  />
);
const Recon = () => (
  <PlaceholderScreen
    title="RECONCILIATION" sub="Cruce pagos ↔ banco ↔ POS" icon="⇄"
    blurb="El motor de conciliación cruza tus pagos y ventas contra los movimientos reales del banco y te avisa de cualquier diferencia."
    activates="Requiere la conexión bancaria. Con banco conectado, cada pago que registres se confirma contra su débito real, y cada depósito de ventas contra su abono."
  />
);
const AIModules = () => (
  <PlaceholderScreen
    title="AI · AUTOMATIZACIÓN" sub="OCR de facturas · email · clasificación" icon="◇"
    blurb="La IA leerá facturas desde foto/PDF/email, sugerirá categorías con confianza visible y detectará duplicados — tú siempre decides."
    activates="Requiere el backend en producción (ya está construido y probado). La IA nunca aprueba ni paga: solo propone."
  />
);
const Insights = () => (
  <PlaceholderScreen
    title="INTELLIGENCE" sub="Alertas y health score" icon="◎"
    blurb="Detectores proactivos (costos, caja, duplicados, varianzas) y un score de salud explicable de tu negocio."
    activates="Se calcula solo cuando tengas algunas semanas de datos registrados — más datos, mejores alertas."
  />
);

const modules = [
  { key: 'dashboard', label: 'HOME', icon: '◈', Screen: LiveDashboardScreen },
  { key: 'pos', label: 'VENTAS', icon: '◉', Screen: LivePOSScreen },
  { key: 'ap', label: 'FACTURAS', icon: '▤', Screen: LiveAPScreen },
  { key: 'treasury', label: 'PAGOS', icon: '⏷', Screen: LiveTreasuryScreen },
  { key: 'reports', label: 'REPORTES', icon: '◔', Screen: LiveReportsScreen },
  { key: 'banking', label: 'BANCO', icon: '≋', Screen: Banking },
  { key: 'recon', label: 'CONCILIAR', icon: '⇄', Screen: Recon },
  { key: 'ai', label: 'AI', icon: '◇', Screen: AIModules },
  { key: 'intel', label: 'ALERTAS', icon: '◎', Screen: Insights },
] as const;

type ModuleKey = (typeof modules)[number]['key'];

export default function App() {
  const [moduleKey, setModuleKey] = useState<ModuleKey>('dashboard');
  const { width } = useWindowDimensions();
  const [fontsLoaded] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
    IBMPlexMono_700Bold,
  });
  if (!fontsLoaded) return null;

  const Screen = modules.find((m) => m.key === moduleKey)!.Screen;

  const app = (
    <StoreProvider>
      <View style={{ flex: 1, backgroundColor: colors.appBg }}>
        <View style={{ flex: 1 }}>
          <Screen key={moduleKey} />
        </View>
        <ModuleDock modules={modules} activeKey={moduleKey} onSelect={(k) => setModuleKey(k as ModuleKey)} />
      </View>
    </StoreProvider>
  );

  if (Platform.OS === 'web') {
    // Narrow viewports (a phone browser, a small window): the app fills the
    // screen like a real app. Wide screens get the centered review frame.
    if (width < 560) {
      return <View style={{ flex: 1, backgroundColor: colors.appBg }}>{app}</View>;
    }
    return (
      <View style={{ flex: 1, backgroundColor: colors.pageBg, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 }}>
        <View style={{ width: 430, height: 880, maxHeight: '96%' as unknown as number, borderRadius: 40, overflow: 'hidden', borderWidth: 1, borderColor: '#d8d5cc' }}>
          {app}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink }}>
      <StatusBar style="light" />
      {app}
    </SafeAreaView>
  );
}
