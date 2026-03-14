import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Dimensions, Animated, PanResponder
} from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import MapView, { Marker, Polyline, Circle } from 'react-native-maps';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

// --- CONFIGURATION ---
const channel = "3295334";
const readKey = "MD9EMSMGAVDP1661";
const url = `https://api.thingspeak.com/channels/${channel}/feeds.json?api_key=${readKey}&results=10`;
const { width } = Dimensions.get('window');

// Premium Color Palette
const COLORS = {
  background: '#F6F8FA',
  card: '#FFFFFF',
  textDark: '#0B192C',
  textMuted: '#64748B',
  primary: '#138A9C', // Teal from mockup
  primaryLight: '#E8F4F6',
  danger: '#E63946',
  dangerLight: '#FDECEE',
  warning: '#F4A261',
  safe: '#00B4D8',
  border: '#E2E8F0',
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true }),
});

const AppContext = createContext();

// --- CUSTOM HOOK ---
function useThingspeak() {
  const [data, setData] = useState({
    labels: [], rain: [], level: [], flow: [], temp: [], hum: [],
    lastValues: { rain: '0', level: '0.0', flow: '0', temp: '0', hum: '0' },
    prediction: 'WAITING', loading: true, hasData: false
  });

  useEffect(() => {
    let interval;
    const loadData = async () => {
      try {
        const res = await fetch(url);
        const json = await res.json();
        if (!json.feeds || json.feeds.length === 0) return;

        let rain = [], level = [], flow = [], temp = [], hum = [], labels = [];
        json.feeds.forEach(f => {
          rain.push(f.field1 != null ? Number(f.field1) : 0);
          level.push(f.field2 != null ? Number(f.field2) : 0);
          flow.push(f.field3 != null ? Number(f.field3) : 0);
          temp.push(f.field4 != null ? Number(f.field4) : 0);
          hum.push(f.field5 != null ? Number(f.field5) : 0);
          
          const dateObj = new Date(f.created_at);
          labels.push(`${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`);
        });

        const last = rain.length - 1;
        let prediction = "NOMINAL";
        if (level[last] > 4) prediction = "CRITICAL";
        else if (level[last] > 2) prediction = "WARNING";

        setData({
          labels, rain, level, flow, temp, hum,
          lastValues: { rain: rain[last], level: level[last], flow: flow[last], temp: temp[last], hum: hum[last] },
          prediction, loading: false, hasData: true
        });
      } catch (e) {
        console.error("Fetch error", e);
      }
    };
    loadData();
    interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  return data;
}

// --- SCREENS ---

function DashboardScreen() {
  const { tsData } = useContext(AppContext);

  const getStatusData = () => {
    if (tsData.prediction === 'CRITICAL') return { color: COLORS.danger, title: 'CRITICAL', desc: 'Water levels exceed safe operational thresholds. Evacuate.' };
    if (tsData.prediction === 'WARNING') return { color: COLORS.warning, title: 'WARNING', desc: 'Sensor readings indicate rising water levels. Be prepared.' };
    if (tsData.prediction === 'WAITING') return { color: COLORS.textMuted, title: 'CONNECTING', desc: 'Establishing connection to IoT sensor network...' };
    return { color: '#00A676', title: 'NOMINAL', desc: 'All sensor readings are within safe operational thresholds.' };
  };

  const status = getStatusData();
  const maxRain = Math.max(...(tsData.rain.length ? tsData.rain : [10]), 10);

  if (tsData.loading && !tsData.hasData) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Syncing IoT Sensors...</Text>
      </View>
    );
  }

  // Wrapped in SafeAreaView to respect top notch/status bar perfectly
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Overview</Text>
          <TouchableOpacity style={styles.iconButton}>
            <MaterialCommunityIcons name="bell" size={22} color={COLORS.textDark} />
          </TouchableOpacity>
        </View>

        {/* Status Card */}
        <View style={[styles.statusCard, { borderLeftColor: status.color }]}>
          <Text style={styles.statusSubtitle}>CURRENT STATUS</Text>
          <Text style={styles.statusTitle}>{status.title}</Text>
          <Text style={styles.statusDesc}>{status.desc}</Text>
        </View>

        {/* Water Level Card */}
        <View style={styles.largeCard}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardTitle}>Water Level</Text>
            <MaterialCommunityIcons name="waves" size={24} color={COLORS.primary} />
          </View>
          <Text style={styles.hugeValue}>{tsData.lastValues.level} <Text style={styles.unitText}>m</Text></Text>
          <View style={styles.aestheticLineContainer}>
             <LinearGradient colors={['rgba(19, 138, 156, 0.2)', 'rgba(255,255,255,0)']} style={styles.aestheticGradient} />
             <View style={styles.aestheticLine} />
          </View>
        </View>

        {/* Rainfall Card */}
        <View style={styles.largeCard}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardTitle}>Rainfall</Text>
            <MaterialCommunityIcons name="weather-pouring" size={24} color={COLORS.primary} />
          </View>
          <Text style={styles.hugeValue}>{tsData.lastValues.rain} <Text style={styles.unitText}>mm/h</Text></Text>
          
          <View style={styles.barChartContainer}>
            {tsData.rain.slice(-6).map((val, idx) => {
              const height = Math.max((val / maxRain) * 60, 10);
              return (
                <View key={idx} style={[styles.bar, { height, backgroundColor: COLORS.primary, opacity: 0.3 + (idx * 0.1) }]} />
              );
            })}
          </View>
        </View>

        {/* Environmental Grid */}
        <Text style={styles.sectionTitle}>Environmental</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.envScroll}>
          <EnvCard icon="water" title="Flow Rate" value={tsData.lastValues.flow} unit="m³/s" />
          <EnvCard icon="thermometer" title="Temperature" value={tsData.lastValues.temp} unit="°C" />
          <EnvCard icon="water-percent" title="Humidity" value={tsData.lastValues.hum} unit="%" />
        </ScrollView>

      </ScrollView>
    </SafeAreaView>
  );
}

function ActionScreen() {
  const { handleSOS } = useContext(AppContext);
  const pan = useRef(new Animated.ValueXY()).current;
  const slideWidth = width - 64; 
  const maxSlide = slideWidth - 80; 

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dx: pan.x }], { useNativeDriver: false }),
      onPanResponderRelease: (e, gesture) => {
        if (gesture.dx > maxSlide * 0.75) {
          Animated.spring(pan, { toValue: { x: maxSlide, y: 0 }, useNativeDriver: false }).start();
          handleSOS();
          setTimeout(() => { Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start(); }, 3000);
        } else {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, friction: 5, useNativeDriver: false }).start();
        }
      }
    })
  ).current;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.headerTitle, { marginBottom: 20 }]}>Emergency Action</Text>

        <View style={styles.broadcastCard}>
          <View style={styles.broadcastIconBg}>
            <MaterialCommunityIcons name="access-point-network" size={24} color="#00A676" />
          </View>
          <View style={styles.broadcastTextCol}>
            <Text style={styles.broadcastSubtitle}>Broadcast Status</Text>
            <View style={{flexDirection: 'row', alignItems:'center', marginTop: 4}}>
              <View style={styles.greenDot} />
              <Text style={styles.broadcastTitle}>Cellular Network Online</Text>
            </View>
          </View>
          <MaterialCommunityIcons name="check-circle" size={24} color="#00A676" />
        </View>

        <View style={styles.criticalSection}>
          <Text style={styles.criticalTitle}>Critical Alert</Text>
          <Text style={styles.criticalDesc}>Swipe to transmit your GPS coordinates and initiate immediate rescue protocol.</Text>

          <View style={styles.sliderTrack}>
            <Text style={styles.sliderText}>SLIDE TO ALERT RESCUE</Text>
            <Animated.View 
              style={[styles.sliderThumb, { transform: [{ translateX: pan.x.interpolate({ inputRange: [0, maxSlide], outputRange: [0, maxSlide], extrapolate: 'clamp' }) }] }]} 
              {...panResponder.panHandlers}
            >
              <Text style={styles.sliderThumbText}>SOS</Text>
            </Animated.View>
          </View>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="information" size={16} color={COLORS.textMuted} />
            <Text style={styles.infoText}>Initiates 3-second abort countdown</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <Text style={[styles.sectionTitle, { marginBottom: 16 }]}>Direct Dispatch</Text>
        
        <DispatchCard icon="phone" title="Local Coast Guard" desc="Maritime Rescue Coordination" phone="911" />
        <DispatchCard icon="account-supervisor" title="City Emergency Coordinator" desc="Flood Evacuation Command" phone="911" />
        <DispatchCard icon="hospital-box" title="Medical Dispatch" desc="Ambulance & Paramedics" phone="911" />

      </ScrollView>
    </SafeAreaView>
  );
}

function MapScreen() {
  const { location } = useContext(AppContext);
  const mapRegion = location || { latitude: 37.7749, longitude: -122.4194, latitudeDelta: 0.05, longitudeDelta: 0.05 };
  
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <MapView style={{ flex: 1 }} initialRegion={mapRegion} showsUserLocation={true}>
        <Circle center={{ latitude: mapRegion.latitude - 0.01, longitude: mapRegion.longitude - 0.01 }} radius={1000} fillColor="rgba(230, 57, 70, 0.3)" strokeColor={COLORS.danger} strokeWidth={2} />
      </MapView>
      <View style={styles.mapOverlay}>
        <View style={styles.legendItem}><View style={[styles.legendDot, {backgroundColor: COLORS.danger}]} /><Text style={styles.mapOverlayText}>High Risk</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, {backgroundColor: COLORS.safe}]} /><Text style={styles.mapOverlayText}>My Location</Text></View>
      </View>
    </View>
  );
}

// --- REUSABLE COMPONENTS ---
const EnvCard = ({ icon, title, value, unit }) => (
  <View style={styles.envCard}>
    <View style={styles.envIconBg}>
      <MaterialCommunityIcons name={icon} size={24} color={COLORS.primary} />
    </View>
    <Text style={styles.envTitle}>{title}</Text>
    <Text style={styles.envValue}>{value} <Text style={styles.envUnit}>{unit}</Text></Text>
  </View>
);

const DispatchCard = ({ icon, title, desc, phone }) => (
  <TouchableOpacity style={styles.dispatchCard} onPress={() => Linking.openURL(`tel:${phone}`)}>
    <View style={styles.dispatchIconBg}>
      <MaterialCommunityIcons name={icon} size={24} color={COLORS.primary} />
    </View>
    <View style={styles.dispatchTextCol}>
      <Text style={styles.dispatchTitle}>{title}</Text>
      <Text style={styles.dispatchDesc}>{desc}</Text>
    </View>
    <MaterialCommunityIcons name="chevron-right" size={24} color="#CBD5E1" />
  </TouchableOpacity>
);

// --- NAVIGATION & APP WRAPPER ---
const Tab = createBottomTabNavigator();

export default function App() {
  const [location, setLocation] = useState(null);
  const tsData = useThingspeak();

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        let loc = await Location.getCurrentPositionAsync({});
        setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 });
      }
      await Notifications.requestPermissionsAsync();
    })();
  }, []);

  const handleSOS = () => {
    let msg = "EMERGENCY: Flood critical.";
    if (location) msg += ` Loc: https://maps.google.com/?q=${location.latitude},${location.longitude}`;
    Linking.openURL(`sms:911?body=${encodeURIComponent(msg)}`);
    setTimeout(() => Linking.openURL('tel:911'), 2000);
  };

  return (
    <SafeAreaProvider>
      <AppContext.Provider value={{ tsData, location, handleSOS }}>
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarShowLabel: true,
              tabBarActiveTintColor: COLORS.primary,
              tabBarInactiveTintColor: '#94A3B8',
              tabBarStyle: styles.tabBar,
              tabBarLabelStyle: styles.tabBarLabel,
            }}
          >
            <Tab.Screen 
              name="Dashboard" 
              component={DashboardScreen} 
              options={{ tabBarIcon: ({ color }) => <MaterialCommunityIcons name="view-grid" size={26} color={color} /> }}
            />
            <Tab.Screen 
              name="History" 
              component={DashboardScreen} 
              options={{ tabBarIcon: ({ color }) => <MaterialCommunityIcons name="chart-line" size={26} color={color} /> }}
            />
            <Tab.Screen 
              name="Map" 
              component={MapScreen} 
              options={{ tabBarIcon: ({ color }) => <MaterialCommunityIcons name="map" size={26} color={color} /> }}
            />
            <Tab.Screen 
              name="Action" 
              component={ActionScreen} 
              options={{ tabBarIcon: ({ color }) => <MaterialCommunityIcons name="asterisk" size={26} color={color} /> }}
            />
          </Tab.Navigator>
        </NavigationContainer>
      </AppContext.Provider>
    </SafeAreaProvider>
  );
}

// --- STYLESHEET ---
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  loadingText: { marginTop: 15, color: COLORS.textMuted, fontSize: 16, fontWeight: '600' },
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: 24, paddingBottom: 40 }, // Removed massive padding because safe area handles it naturally now
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: COLORS.textDark, letterSpacing: -0.5 },
  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
  
  statusCard: { backgroundColor: COLORS.card, borderRadius: 20, padding: 20, marginBottom: 20, borderLeftWidth: 8, elevation: 3, shadowColor: '#94a3b8', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  statusSubtitle: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 1.2, marginBottom: 8, textTransform: 'uppercase' },
  statusTitle: { fontSize: 26, fontWeight: '900', color: COLORS.textDark, marginBottom: 12, letterSpacing: -0.5 },
  statusDesc: { fontSize: 15, color: COLORS.textMuted, lineHeight: 22 },

  largeCard: { backgroundColor: COLORS.card, borderRadius: 24, padding: 24, marginBottom: 20, elevation: 3, shadowColor: '#94a3b8', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 15, color: COLORS.textMuted, fontWeight: '600' },
  hugeValue: { fontSize: 42, fontWeight: '800', color: COLORS.textDark, letterSpacing: -1 },
  unitText: { fontSize: 18, fontWeight: '600', color: COLORS.textMuted },
  
  aestheticLineContainer: { height: 60, marginTop: 10, justifyContent: 'flex-end' },
  aestheticGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 40 },
  aestheticLine: { height: 4, backgroundColor: COLORS.primary, borderRadius: 2, transform: [{ rotate: '-3deg' }] },

  barChartContainer: { flexDirection: 'row', alignItems: 'flex-end', height: 60, marginTop: 16, gap: 4 },
  bar: { flex: 1, borderRadius: 4 },

  sectionTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textDark, marginBottom: 16, marginTop: 8 },
  envScroll: { paddingBottom: 10, gap: 16 },
  envCard: { backgroundColor: COLORS.card, borderRadius: 20, padding: 20, width: 140, elevation: 2, shadowColor: '#94a3b8', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, marginRight: 16 },
  envIconBg: { backgroundColor: COLORS.primaryLight, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  envTitle: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600', marginBottom: 6 },
  envValue: { fontSize: 22, fontWeight: '800', color: COLORS.textDark },
  envUnit: { fontSize: 14, color: COLORS.textMuted },

  broadcastCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 20, padding: 20, marginBottom: 40, elevation: 2, shadowOpacity: 0.05 },
  broadcastIconBg: { backgroundColor: '#E6F6F1', width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  broadcastTextCol: { flex: 1 },
  broadcastSubtitle: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },
  broadcastTitle: { fontSize: 15, color: COLORS.textDark, fontWeight: '700' },
  greenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00A676', marginRight: 8 },

  criticalSection: { alignItems: 'center', marginBottom: 30 },
  criticalTitle: { fontSize: 22, fontWeight: '800', color: COLORS.textDark, marginBottom: 10 },
  criticalDesc: { fontSize: 15, color: COLORS.textMuted, textAlign: 'center', paddingHorizontal: 20, marginBottom: 30, lineHeight: 22 },
  
  sliderTrack: { width: '100%', height: 70, backgroundColor: COLORS.dangerLight, borderRadius: 35, justifyContent: 'center', padding: 5, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(230, 57, 70, 0.2)' },
  sliderText: { position: 'absolute', width: '100%', textAlign: 'center', color: COLORS.danger, fontWeight: '800', fontSize: 15, letterSpacing: 1 },
  sliderThumb: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.danger, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: COLORS.danger, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: {width: 0, height: 4} },
  sliderThumbText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  
  infoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 6 },
  infoText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '500' },
  
  divider: { height: 1, backgroundColor: COLORS.border, marginBottom: 30, marginHorizontal: 10 },
  
  dispatchCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 20, padding: 16, marginBottom: 16, elevation: 2, shadowOpacity: 0.05 },
  dispatchIconBg: { backgroundColor: COLORS.primaryLight, width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  dispatchTextCol: { flex: 1 },
  dispatchTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textDark, marginBottom: 4 },
  dispatchDesc: { fontSize: 13, color: COLORS.textMuted },

  mapOverlay: { position: 'absolute', bottom: 20, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.95)', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 30, elevation: 5, shadowOpacity: 0.1, flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  mapOverlayText: { fontWeight: '700', fontSize: 13, color: COLORS.textDark },
  
  // FIX: Let React Navigation naturally handle the height and Safe Area padding!
  tabBar: {
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    minHeight: 65,
    paddingTop: 8,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  tabBarLabel: { fontSize: 11, fontWeight: '700', paddingBottom: 4 },
});