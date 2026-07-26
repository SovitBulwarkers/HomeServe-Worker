import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, fontSize, fontWeight, spacing, radius } from '../theme';

interface Props {
  workerLat: number | null;
  workerLng: number | null;
  customerLat: number | null;
  customerLng: number | null;
  distanceKm?: number | null;
  height?: number;
}

/**
 * Small embedded map used on a "New Job" request card so a worker can see
 * exactly where the customer is — and how far — before tapping Accept.
 *
 * Renders OpenStreetMap tiles via Leaflet inside a WebView instead of
 * react-native-maps' Google provider — this needs no Google Maps API key
 * and no billing account, and has no usage cap or cost.
 *
 * Falls back to a plain text message if either point is missing (e.g. the
 * worker hasn't granted location yet), instead of rendering a broken map.
 */
export default function JobLocationMap({
  workerLat,
  workerLng,
  customerLat,
  customerLng,
  distanceKm,
  height = 150,
}: Props) {
  const hasBoth =
    workerLat != null && workerLng != null && customerLat != null && customerLng != null;

  const html = useMemo(() => {
    if (!hasBoth) return '';
    return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: ${colors.surfaceMuted}; }
    .leaflet-control-attribution { font-size: 8px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var worker = [${workerLat}, ${workerLng}];
    var customer = [${customerLat}, ${customerLng}];
    var map = L.map('map', {
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
      attributionControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    var workerIcon = L.divIcon({
      className: '',
      html: '<div style="width:14px;height:14px;border-radius:50%;background:${colors.primary};border:2px solid white;box-shadow:0 0 2px rgba(0,0,0,0.4);"></div>',
      iconSize: [14, 14],
    });
    var customerIcon = L.divIcon({
      className: '',
      html: '<div style="width:14px;height:14px;border-radius:50%;background:#D92D20;border:2px solid white;box-shadow:0 0 2px rgba(0,0,0,0.4);"></div>',
      iconSize: [14, 14],
    });

    L.marker(worker, { icon: workerIcon }).addTo(map).bindTooltip('You');
    L.marker(customer, { icon: customerIcon }).addTo(map).bindTooltip('Customer');
    L.polyline([worker, customer], { color: '${colors.primary}', weight: 2, dashArray: '6, 6' }).addTo(map);

    var bounds = L.latLngBounds([worker, customer]);
    map.fitBounds(bounds, { padding: [24, 24] });
  </script>
</body>
</html>`;
  }, [hasBoth, workerLat, workerLng, customerLat, customerLng]);

  if (!hasBoth) {
    return (
      <View style={[styles.fallback, { height }]}>
        <Text style={styles.fallbackText}>
          {customerLat != null && customerLng != null
            ? 'Enable location to see distance to this job'
            : 'Customer location unavailable'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        source={{ html }}
        style={StyleSheet.absoluteFillObject}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        originWhitelist={['*']}
      />
      {distanceKm != null ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{distanceKm.toFixed(1)} km away</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  fallback: {
    width: '100%',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  fallbackText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
});
