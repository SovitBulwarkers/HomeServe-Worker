import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, FlatList, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, fontWeight, spacing } from '../../src/theme';
import Button from '../../src/components/Button';
import { ONBOARDING_KEY } from '../_layout';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    icon: 'briefcase-outline' as const,
    title: 'Get job requests nearby',
    subtitle: 'See new service requests that match your skills the moment they come in, and accept the ones that work for you.',
  },
  {
    icon: 'navigate-outline' as const,
    title: 'Manage your day, your way',
    subtitle: 'Go online when you want to work. Track today\'s jobs, start and complete them right from the app.',
  },
  {
    icon: 'wallet-outline' as const,
    title: 'Get paid, on time',
    subtitle: 'Earnings land straight in your HomeServe wallet after every completed job. Withdraw to your bank whenever you like.',
  },
];

export default function Onboarding() {
  const router = useRouter();
  const listRef = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);

  const finish = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.replace('/(auth)/login');
  };

  const next = () => {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1 });
      setIndex(index + 1);
    } else {
      finish();
    }
  };

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <Pressable style={styles.skip} onPress={finish}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>

        <FlatList
          ref={listRef}
          data={SLIDES}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / width);
            setIndex(i);
          }}
          renderItem={({ item }) => (
            <View style={[styles.slide, { width }]}>
              <View style={styles.iconCircle}>
                <Ionicons name={item.icon} size={56} color={colors.white} />
              </View>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.subtitle}>{item.subtitle}</Text>
            </View>
          )}
        />

        <View style={styles.bottom}>
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
          <Button
            title={index === SLIDES.length - 1 ? 'Get Started' : 'Next'}
            onPress={next}
            variant="outline"
            style={styles.nextButton}
          />
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  skip: { alignSelf: 'flex-end', paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  skipText: { color: colors.white, fontWeight: fontWeight.semibold, fontSize: fontSize.md },
  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxxl },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxxl,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.extrabold,
    color: colors.white,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  subtitle: { fontSize: fontSize.md, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 22 },
  bottom: { paddingHorizontal: spacing.xxl, paddingBottom: spacing.xl },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.xxl },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { width: 24, backgroundColor: colors.white },
  nextButton: { backgroundColor: colors.white, borderWidth: 0 },
});
