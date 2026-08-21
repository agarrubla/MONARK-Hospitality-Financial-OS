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
import { Platform, SafeAreaView, Text, useWindowDimensions, View } from 'react-native';
import { ModuleDock } from './src/navigation/ModuleDock';
import LiveBankingScreen from './src/screens/live/LiveBankingScreen';
import LiveReconScreen from './src/screens/live/LiveReconScreen';
import LiveAPScreen from './src/screens/live/LiveAPScreen';
import LiveDashboardScreen from './src/screens/live/LiveDashboardScreen';
import LivePOSScreen from './src/screens/live/LivePOSScreen';
import LiveReportsScreen from './src/screens/live/LiveReportsScreen';
import LiveSettingsScreen from './src/screens/live/LiveSettingsScreen';
import LiveTreasuryScreen from './src/screens/live/LiveTreasuryScreen';
import PlaceholderScreen from './src/screens/live/PlaceholderScreen';
import { StoreProvider, useStore } from './src/store/store';
import { colors } from './src/theme/tokens';

const AIModules = () => (
  <PlaceholderScreen
    title="AI · AUTOMATIZACIÓN" sub="OCR de facturas · email · clasificación" icon="◇"
    blurb="La IA leerá facturas desde foto/PDF/email, sugerirá categorías con confianza visible y detectará duplicados — tú siempre decides."
    activates="Se activa con el servicio de IA en producción. La IA nunca aprueba ni paga: solo propone."
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
  { key: 'banking', label: 'BANCO', icon: '≋', Screen: LiveBankingScreen },
  { key: 'recon', label: 'CONCILIAR', icon: '⇄', Screen: LiveReconScreen },
  { key: 'ai', label: 'AI', icon: '◇', Screen: AIModules },
  { key: 'intel', label: 'ALERTAS', icon: '◎', Screen: Insights },
  { key: 'config', label: 'AJUSTES', icon: '⚙', Screen: LiveSettingsScreen },
] as const;

type ModuleKey = (typeof modules)[number]['key'];

function Shell() {
  const { ready, authed, busy, lastError, ensureSession } = useStore();
  const [moduleKey, setModuleKey] = useState<ModuleKey>('dashboard');

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.appBg }} />;
  if (!authed) {
    // The module session is silent (identity will come from the super-app
    // login); this state only appears if the first connection failed.
    return (
      <View style={{ flex: 1, backgroundColor: colors.appBg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
        <Text style={{ fontFamily: 'IBMPlexMono_700Bold', fontSize: 16, letterSpacing: 2, color: colors.text }}>MONARK</Text>
        <Text style={{ fontFamily: 'IBMPlexSans_400Regular', fontSize: 12.5, lineHeight: 18, color: colors.textSecondary2, textAlign: 'center' }}>
          {lastError ?? 'Preparando el módulo financiero…'}
        </Text>
        {!!lastError && (
          <Text
            onPress={() => { void ensureSession().catch(() => {}); }}
            style={{ fontFamily: 'IBMPlexSans_600SemiBold', fontSize: 12.5, color: colors.green, padding: 8 }}
          >
            {busy ? 'Conectando…' : 'Reintentar'}
          </Text>
        )}
      </View>
    );
  }

  const Screen = modules.find((m) => m.key === moduleKey)!.Screen;
  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg }}>
      <View style={{ flex: 1 }}>
        <Screen key={moduleKey} />
      </View>
      <ModuleDock modules={modules} activeKey={moduleKey} onSelect={(k) => setModuleKey(k as ModuleKey)} />
    </View>
  );
}

export default function App() {
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

  const app = (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );

  if (Platform.OS === 'web') {
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
