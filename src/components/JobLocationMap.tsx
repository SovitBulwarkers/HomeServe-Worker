import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
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
 * Renders map tiles via Leaflet inside a WebView instead of
 * react-native-maps' Google provider — this needs no Google Maps API key
 * and no billing account, and has no usage cap or cost. Includes a
 * street/satellite toggle: street tiles from OpenStreetMap, satellite
 * tiles from Esri World Imagery — both free, no API key required.
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
  const [satellite, setSatellite] = useState(false);
  const hasBoth =
    workerLat != null && workerLng != null && customerLat != null && customerLng != null;

  const tileUrl = satellite
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileAttribution = satellite
    ? 'Tiles &copy; Esri'
    : '&copy; OpenStreetMap contributors';

  // Only ever rendered into the WebView below when hasBoth is true (see the
  // early return further down), so the `?? 0` here is just to satisfy
  // TypeScript's null checks — it's never actually used as a real coordinate.
  const effWorkerLat = workerLat ?? 0;
  const effWorkerLng = workerLng ?? 0;
  const effCustomerLat = customerLat ?? 0;
  const effCustomerLng = customerLng ?? 0;

  const html = useMemo(() => {
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
    var worker = [${effWorkerLat}, ${effWorkerLng}];
    var customer = [${effCustomerLat}, ${effCustomerLng}];
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
    L.tileLayer('${tileUrl}', {
      maxZoom: 19,
      attribution: '${tileAttribution}'
    }).addTo(map);

    var workerIcon = L.divIcon({
      className: '',
      html: '<div style="width:16px;height:16px;border-radius:50%;background:${colors.primary};border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>',
      iconSize: [16, 16],
    });
    var customerIcon = L.divIcon({
      className: '',
      html: '<div style="width:16px;height:16px;border-radius:50%;background:#D92D20;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>',
      iconSize: [16, 16],
    });

    L.marker(worker, { icon: workerIcon }).addTo(map).bindTooltip('You');
    L.marker(customer, { icon: customerIcon }).addTo(map).bindTooltip('Customer');
    L.polyline([worker, customer], { color: '${colors.primary}', weight: 3, dashArray: '6, 6' }).addTo(map);

    var bounds = L.latLngBounds([worker, customer]);
    map.fitBounds(bounds, { padding: [24, 24] });
  </script>
</body>
</html>`;
  }, [effWorkerLat, effWorkerLng, effCustomerLat, effCustomerLng, satellite]);

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
        key={satellite ? 'satellite' : 'street'}
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
      <Pressable style={styles.satToggle} onPress={() => setSatellite((v) => !v)}>
        <Text style={styles.satToggleText}>{satellite ? 'Street' : 'Satellite'}</Text>
      </Pressable>
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
  satToggle: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
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
  satToggleText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
});
