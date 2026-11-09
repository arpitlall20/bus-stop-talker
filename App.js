import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';

import { nearestStops, nextBuses, describeArrivals } from './src/core';
import { decodeDestinations } from './src/destinations';
import { fetchTripUpdates } from './src/feed';
import stops from './src/data/stops.json';
import routes from './src/data/routes.json';
import destinationData from './src/data/destinations.json';

const FEED_MAX_AGE_MS = 20000; // reuse the live feed for 20 s when switching stops
const NEARBY_STOPS = 3;

let destinationOf = null;
function getDestinationOf() {
  if (!destinationOf) destinationOf = decodeDestinations(destinationData);
  return destinationOf;
}

// With VoiceOver or TalkBack on, let the screen reader speak (in the rider's own voice and speed)
// so the two don't talk over each other. Otherwise use the phone's text-to-speech.
async function say(text) {
  const screenReaderOn = await AccessibilityInfo.isScreenReaderEnabled();
  if (screenReaderOn) {
    AccessibilityInfo.announceForAccessibility(text);
  } else {
    await Speech.stop();
    Speech.speak(text, { language: 'en-AU' });
  }
}

export default function App() {
  const [message, setMessage] = useState('Press the big button to hear the next buses at your nearest stop.');
  const [busy, setBusy] = useState(false);
  const nearby = useRef([]); // nearest stops from the last location fix
  const stopIndex = useRef(0);
  const accuracy = useRef(null);
  const feedCache = useRef({ feed: null, at: 0 });

  const getFeed = useCallback(async () => {
    const c = feedCache.current;
    if (c.feed && Date.now() - c.at < FEED_MAX_AGE_MS) return c.feed;
    const feed = await fetchTripUpdates();
    feedCache.current = { feed, at: Date.now() };
    return feed;
  }, []);

  const announceStop = useCallback(async () => {
    const stop = nearby.current[stopIndex.current];
    const feed = await getFeed();
    const now = Math.floor(Date.now() / 1000);
    const buses = nextBuses(feed, stop.id, now, { routes, destinationOf: getDestinationOf() });
    const text = describeArrivals(stop, buses, { accuracyM: accuracy.current });
    setMessage(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await say(text);
  }, [getFeed]);

  const run = useCallback(
    async (job) => {
      if (busy) return;
      setBusy(true);
      try {
        await job();
      } catch (e) {
        const text = `Sorry, that didn't work. ${e.message || ''}`.trim();
        setMessage(text);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        await say(text);
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const onNextBuses = () =>
    run(async () => {
      setMessage('Finding your nearest stop…');
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        throw new Error(
          'This app needs your location to find the nearest stop. You can allow it in Settings.',
        );
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      accuracy.current = pos.coords.accuracy;
      nearby.current = nearestStops(stops, pos.coords.latitude, pos.coords.longitude, NEARBY_STOPS);
      stopIndex.current = 0;
      if (nearby.current.length === 0) throw new Error('No bus stops were found within about 5 kilometres.');
      feedCache.current = { feed: null, at: 0 }; // always fresh on the main button
      await announceStop();
    });

  const onOtherStop = () =>
    run(async () => {
      if (nearby.current.length < 2) {
        throw new Error('Press the big button first to find nearby stops.');
      }
      stopIndex.current = (stopIndex.current + 1) % nearby.current.length;
      await announceStop();
    });

  const onRepeat = () => say(message);

  useEffect(
    () => () => {
      Speech.stop();
    },
    [],
  );

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <Pressable
          style={({ pressed }) => [styles.bigButton, pressed && styles.pressed, busy && styles.busy]}
          onPress={onNextBuses}
          accessibilityRole="button"
          accessibilityLabel="Next buses"
          accessibilityHint="Finds your nearest stop and reads out the next three buses"
          accessibilityState={{ busy }}
        >
          <Text style={styles.bigText}>{busy ? 'Checking…' : 'Next buses'}</Text>
        </Pressable>

        <View style={styles.row}>
          <Pressable
            style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}
            onPress={onOtherStop}
            accessibilityRole="button"
            accessibilityLabel="Other nearby stop"
            accessibilityHint="Reads out buses for the next closest stop, for example across the road"
          >
            <Text style={styles.smallText}>Other stop</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}
            onPress={onRepeat}
            accessibilityRole="button"
            accessibilityLabel="Repeat"
            accessibilityHint="Reads the last message again"
          >
            <Text style={styles.smallText}>Repeat</Text>
          </Pressable>
        </View>

        <Text style={styles.message} accessibilityLiveRegion="polite">
          {message}
        </Text>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// High contrast, large targets.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000', padding: 16, gap: 16 },
  bigButton: {
    flex: 3,
    marginTop: 16,
    backgroundColor: '#FFD400',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigText: { color: '#000', fontSize: 48, fontWeight: '800' },
  row: { flex: 1, flexDirection: 'row', gap: 16 },
  smallButton: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallText: { color: '#000', fontSize: 28, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  busy: { backgroundColor: '#B39500' },
  message: { flex: 2, color: '#FFF', fontSize: 24, lineHeight: 32 },
});
