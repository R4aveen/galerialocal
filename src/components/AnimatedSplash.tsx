import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useAppTheme } from '../theme/AppThemeContext';

interface AnimatedSplashProps {
  onFinish: () => void;
}

export default function AnimatedSplash({ onFinish }: AnimatedSplashProps) {
  const { colors } = useAppTheme();
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sequence = Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          speed: 13,
          bounciness: 8,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(420),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 280,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    sequence.start(({ finished }) => {
      if (finished) {
        onFinish();
      }
    });

    return () => {
      sequence.stop();
    };
  }, [logoOpacity, onFinish, opacity, scale]);

  return (
    <Animated.View pointerEvents="none" style={[styles.overlay, { backgroundColor: colors.background, opacity }]}>
      <Animated.View style={[styles.logoWrap, { transform: [{ scale }], opacity: logoOpacity }]}>
        <Image source={require('../../galeryapp.png')} style={styles.logo} contentFit="contain" />
        <Text style={[styles.title, { color: colors.text }]}>galetiki</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 24,
  },
  title: {
    marginTop: 14,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
});
