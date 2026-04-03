import React, { useState } from 'react';
import { StyleSheet, View, Dimensions, Pressable, Share, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring,
} from 'react-native-reanimated';
import { COLORS, SPACING } from '../../constants/theme';
import { X, Share2, Trash2, Info } from 'lucide-react-native';
import * as MediaLibrary from 'expo-media-library';
import { useTrash } from '../../hooks/useTrash';
import ConfirmationModal from '../../components/ConfirmationModal';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function PhotoDetailScreen() {
  const params = useLocalSearchParams<{ id: string; uri: string; filename: string }>();
  const router = useRouter();
  const { moveToTrash } = useTrash();
  const [showConfirm, setShowConfirm] = useState(false);

  const id = params.id;
  const uri = params.uri;
  const filename = params.filename || `IMG_${id}.jpg`;

  // Animaciones para el Zoom
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1);
      }
      savedScale.value = scale.value;
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ] as any,
  }));

  const handleShare = async () => {
    try {
      await Share.share({
        url: uri,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleDelete = () => {
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    setShowConfirm(false);
    const success = await moveToTrash({ id, uri, filename } as MediaLibrary.Asset);
    if (success) {
      router.back();
    } else {
      Alert.alert('Error', 'No se pudo mover a la papelera');
    }
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <X color={COLORS.text} size={24} />
        </Pressable>
        <View style={styles.headerRight}>
          <Pressable onPress={handleShare} style={styles.iconButton}>
            <Share2 color={COLORS.text} size={24} />
          </Pressable>
          <Pressable onPress={handleDelete} style={styles.iconButton}>
            <Trash2 color={COLORS.error} size={24} />
          </Pressable>
        </View>
      </View>

      <GestureDetector gesture={Gesture.Race(pinchGesture, panGesture)}>
        <Animated.View style={[styles.imageContainer, animatedStyle]}>
          <Image
            source={{ uri }}
            style={styles.image}
            contentFit="contain"
            transition={300}
          />
        </Animated.View>
      </GestureDetector>

      <View style={styles.footer}>
        <Pressable style={styles.infoButton}>
          <Info color={COLORS.textMuted} size={20} />
          <View style={{ marginLeft: 8 }}>
            <Animated.Text style={styles.infoText}>Ver detalles</Animated.Text>
          </View>
        </Pressable>
      </View>

      <ConfirmationModal
        visible={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={confirmDelete}
        title="¿Mover a la papelera?"
        message="La foto se podrá recuperar desde la papelera durante los próximos 30 días."
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    zIndex: 10,
  },
  headerRight: {
    flexDirection: 'row',
  },
  iconButton: {
    padding: 8,
    marginLeft: 8,
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: SPACING.xl,
    alignItems: 'center',
  },
  infoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  infoText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
});
