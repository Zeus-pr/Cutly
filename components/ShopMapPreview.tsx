import { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { useColors, useThemedStyles } from '@/store/useThemeStore';

type Props = {
  latitude: number;
  longitude: number;
  label?: string;
  onDirections: () => void;
};

/** Live OSM map (Leaflet) — no API key. Replaces dead staticmap.openstreetmap.de. */
export function ShopMapPreview({ latitude, longitude, label, onDirections }: Props) {
  const colors = useColors();
  const styles = useThemedStyles(mapStyles);
  const html = useMemo(() => leafletHtml(latitude, longitude, label || 'Shop'), [latitude, longitude, label]);

  return (
    <View style={styles.box}>
      <WebView
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://localhost' }}
        style={styles.map}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        androidLayerType={Platform.OS === 'android' ? 'hardware' : undefined}
        accessibilityLabel={`Map of ${label || 'shop location'}`}
      />
      <Pressable
        style={styles.directions}
        onPress={onDirections}
        accessibilityRole="button"
        accessibilityLabel="Open directions in Google Maps"
        hitSlop={6}
      >
        <Ionicons name="navigate" size={18} color={colors.white} />
        <Text style={styles.directionsText}>Directions</Text>
      </Pressable>
    </View>
  );
}

function leafletHtml(lat: number, lng: number, title: string) {
  const safeTitle = JSON.stringify(String(title).slice(0, 80));
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin: 0; height: 100%; width: 100%; background: #E9DED0; }
    .leaflet-control-attribution { font-size: 9px !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: false, attributionControl: true })
      .setView([${lat}, ${lng}], 16);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    L.marker([${lat}, ${lng}]).addTo(map).bindPopup(${safeTitle});
    setTimeout(function () { map.invalidateSize(); }, 120);
  </script>
</body>
</html>`;
}

function mapStyles(colors: Palette) {
  return StyleSheet.create({
    box: {
      marginTop: spacing.sm,
      height: 180,
      borderRadius: radii.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.sand
    },
    map: { flex: 1, backgroundColor: colors.sand },
    directions: {
      position: 'absolute',
      right: 10,
      bottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.accent,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radii.pill
    },
    directionsText: { ...typography.caption, color: colors.white, fontWeight: '700' }
  });
}
