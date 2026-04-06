import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { ResizeMode, Video, type AVPlaybackStatus } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  Crop,
  FlipHorizontal2,
  FlipVertical2,
  Info,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCw,
  Save,
  Share2,
  Trash2,
  Volume2,
  X,
} from 'lucide-react-native';
import * as MediaLibrary from 'expo-media-library';
import ConfirmationModal from '../../components/ConfirmationModal';
import { COLORS, SPACING } from '../../constants/theme';
import { usePrivateVault } from '../../hooks/usePrivateVault';
import { useTrash } from '../../hooks/useTrash';
import {
  getGallerySession,
  removeAssetFromGallerySession,
  replaceAssetInGallerySession,
} from '../../store/gallerySession';
import { prepareShareUri, sharePreparedUri } from '../../utils/shareMedia';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const toMs = (unixTimestamp: number) =>
  unixTimestamp > 1_000_000_000_000 ? unixTimestamp : unixTimestamp * 1000;
const formatTime = (millis: number) => {
  const safe = Math.max(0, Math.floor(millis / 1000));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const formatBytes = (bytes?: number) => {
  if (!bytes || bytes <= 0) return 'N/D';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
};

const formatDate = (unixTimestamp?: number) => {
  if (!unixTimestamp) return 'N/D';
  return new Date(toMs(unixTimestamp)).toLocaleString('es-ES');
};

const SPEED_OPTIONS = [0.5, 1, 1.25, 1.5, 2];
const FINE_STEP_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SEEK_STEP_MS = 10_000;

let ImageManipulatorModule: any = null;
try {
  // Use lazy runtime import so old dev builds without the native module don't crash at startup.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ImageManipulatorModule = require('expo-image-manipulator');
} catch {
  ImageManipulatorModule = null;
}

export default function PhotoDetailScreen() {
  const params = useLocalSearchParams<{ id: string; uri: string; filename: string; index?: string; source?: string }>();
  const router = useRouter();
  const { moveToTrash } = useTrash();
  const { deletePrivateById } = usePrivateVault();

  const [showConfirm, setShowConfirm] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(Number(params.index || 0));
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [brightness, setBrightness] = useState(1);
  const [volume, setVolume] = useState(1);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(0);
  const [bufferedMillis, setBufferedMillis] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [seekWidth, setSeekWidth] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreviewMillis, setSeekPreviewMillis] = useState<number | null>(null);
  const [fineStepUnits, setFineStepUnits] = useState(3);
  const [assetInfo, setAssetInfo] = useState<MediaLibrary.AssetInfo | null>(null);
  const [assetInfoLoading, setAssetInfoLoading] = useState(false);
  const [assetInfoPermissionLimited, setAssetInfoPermissionLimited] = useState(false);
  const [editedUri, setEditedUri] = useState<string | null>(null);
  const [editWidth, setEditWidth] = useState(0);
  const [editHeight, setEditHeight] = useState(0);
  const [editingBusy, setEditingBusy] = useState(false);

  const videoRef = useRef<Video | null>(null);
  const isSeekingRef = useRef(false);

  const galleryAssets = getGallerySession();
  const fallbackAsset = useMemo(
    () =>
      ({
        id: params.id,
        uri: params.uri,
        filename: params.filename || `IMG_${params.id}.jpg`,
        mediaType: 'photo',
        creationTime: 0,
      } as MediaLibrary.Asset),
    [params.filename, params.id, params.uri]
  );

  const currentAsset = galleryAssets[galleryIndex] || fallbackAsset;
  const id = currentAsset.id;
  const uri = currentAsset.uri;
  const filename = currentAsset.filename || `IMG_${id}.jpg`;
  const isVideo = currentAsset.mediaType === 'video';
  const isPrivateSource =
    params.source === 'private' || params.source === 'private-archived' || params.source === 'private-trash';
  const isPrivateTrashSource = params.source === 'private-trash';
  const displayUri = editedUri || uri;
  const hasPendingEdits = Boolean(editedUri);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const zoomTranslateX = useSharedValue(0);
  const savedZoomTranslateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const swipeTranslateX = useSharedValue(0);
  const verticalTranslate = useSharedValue(0);
  const opacity = useSharedValue(1);
  const chromeOpacity = useSharedValue(1);

  const resetTransforms = () => {
    scale.value = withSpring(1);
    savedScale.value = 1;
    zoomTranslateX.value = withSpring(0);
    savedZoomTranslateX.value = 0;
    translateY.value = withSpring(0);
    savedTranslateY.value = 0;
    swipeTranslateX.value = withSpring(0);
    verticalTranslate.value = withSpring(0);
    opacity.value = withSpring(1);
  };

  const resetPerAssetUi = () => {
    setIsPlaying(false);
    setPlaybackRate(1);
    setBrightness(1);
    setVolume(1);
    setShowInfo(false);
    setChromeVisible(true);
    setShowAdvancedControls(false);
    setPositionMillis(0);
    setDurationMillis(0);
    setBufferedMillis(0);
    setIsBuffering(false);
    setIsSeeking(false);
    isSeekingRef.current = false;
    setSeekPreviewMillis(null);
    setFineStepUnits(3);
    setAssetInfo(null);
    setAssetInfoPermissionLimited(false);
    setEditedUri(null);
    setEditWidth(currentAsset.width || 0);
    setEditHeight(currentAsset.height || 0);
    setEditingBusy(false);
    chromeOpacity.value = withTiming(1, { duration: 140 });
  };

  useEffect(() => {
    setEditedUri(null);
    setEditWidth(currentAsset.width || 0);
    setEditHeight(currentAsset.height || 0);
    setEditingBusy(false);
  }, [currentAsset.id, currentAsset.height, currentAsset.width]);

  useEffect(() => {
    if (!isVideo) {
      setShowAdvancedControls(false);
    }
  }, [isVideo]);

  useEffect(() => {
    if (!showInfo) return;

    let cancelled = false;

    const loadAssetInfo = async () => {
      setAssetInfoLoading(true);
      setAssetInfoPermissionLimited(false);
      try {
        const info = await MediaLibrary.getAssetInfoAsync(currentAsset.id);
        if (!cancelled) {
          setAssetInfo(info);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isLocationPermissionIssue =
          message.includes('ACCESS_MEDIA_LOCATION') || message.includes('ExifInterface');
        if (!isLocationPermissionIssue) {
          console.error('Error loading asset metadata:', error);
        }
        if (!cancelled) {
          setAssetInfo(null);
          setAssetInfoPermissionLimited(isLocationPermissionIssue);
        }
      } finally {
        if (!cancelled) {
          setAssetInfoLoading(false);
        }
      }
    };

    loadAssetInfo();

    return () => {
      cancelled = true;
    };
  }, [showInfo, currentAsset.id]);

  const goNext = () => {
    if (galleryAssets.length <= 1) return;
    setGalleryIndex((prev) => (prev + 1) % galleryAssets.length);
    resetTransforms();
    resetPerAssetUi();
  };

  const goPrevious = () => {
    if (galleryAssets.length <= 1) return;
    setGalleryIndex((prev) => (prev - 1 + galleryAssets.length) % galleryAssets.length);
    resetTransforms();
    resetPerAssetUi();
  };

  const applyEditActions = async (actions: any[]) => {
    if (isVideo || editingBusy) return;
    if (!ImageManipulatorModule?.manipulateAsync) {
      Alert.alert('Editor no disponible', 'Actualiza/reinstala el build para habilitar la edicion de fotos.');
      return;
    }

    setEditingBusy(true);
    try {
      const result = await ImageManipulatorModule.manipulateAsync(displayUri, actions, {
        compress: 1,
        format: ImageManipulatorModule.SaveFormat.JPEG,
      });

      setEditedUri(result.uri);
      setEditWidth(result.width || editWidth);
      setEditHeight(result.height || editHeight);
    } catch (error) {
      console.error('Error applying image edit:', error);
      Alert.alert('Error', 'No se pudo aplicar esta edicion.');
    } finally {
      setEditingBusy(false);
    }
  };

  const cropCenterSquare = async () => {
    if (isVideo) return;
    const srcW = Math.max(1, editWidth || currentAsset.width || SCREEN_WIDTH);
    const srcH = Math.max(1, editHeight || currentAsset.height || SCREEN_HEIGHT);
    const side = Math.min(srcW, srcH);
    const originX = Math.max(0, Math.floor((srcW - side) / 2));
    const originY = Math.max(0, Math.floor((srcH - side) / 2));

    await applyEditActions([
      {
        crop: {
          originX,
          originY,
          width: Math.floor(side),
          height: Math.floor(side),
        },
      },
    ]);
  };

  const saveEditedImage = async (replaceOriginal: boolean) => {
    if (!editedUri || isVideo) return;

    try {
      setEditingBusy(true);

      if (!replaceOriginal) {
        await MediaLibrary.createAssetAsync(editedUri);
        setEditedUri(null);
        Alert.alert('Listo', 'Edicion guardada como copia.');
        return;
      }

      if (isPrivateSource) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
        await FileSystem.copyAsync({ from: editedUri, to: uri });

        const updatedAsset = {
          ...currentAsset,
          uri,
          width: editWidth || currentAsset.width,
          height: editHeight || currentAsset.height,
        } as MediaLibrary.Asset;

        replaceAssetInGallerySession(currentAsset.id, updatedAsset);
        setEditedUri(null);
        Alert.alert('Listo', 'Archivo privado reemplazado.');
        return;
      }

      const newAsset = await MediaLibrary.createAssetAsync(editedUri);
      try {
        await MediaLibrary.deleteAssetsAsync([currentAsset.id]);
      } catch {
        // If deletion fails, keep both files and still preserve edited result.
      }

      replaceAssetInGallerySession(currentAsset.id, newAsset);
      setEditedUri(null);
      Alert.alert('Listo', 'Imagen original reemplazada por la editada.');
    } catch (error) {
      console.error('Error saving edited image:', error);
      Alert.alert('Error', 'No se pudo guardar la edicion.');
    } finally {
      setEditingBusy(false);
    }
  };

  const openSaveEditedPrompt = () => {
    if (!hasPendingEdits || isVideo) return;

    Alert.alert('Guardar edicion', 'Elige como quieres guardar los cambios.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Guardar copia', onPress: () => void saveEditedImage(false) },
      { text: 'Reemplazar original', style: 'destructive', onPress: () => void saveEditedImage(true) },
    ]);
  };

  const closeBySwipeDown = () => {
    router.back();
  };

  const showInfoBySwipeUp = () => {
    setShowInfo(true);
  };

  const adjustBrightness = (delta: number) => {
    setBrightness((prev) => clamp(prev + delta, 0.2, 1));
  };

  const adjustVolume = (delta: number) => {
    setVolume((prev) => clamp(prev + delta, 0, 1));
  };

  const togglePlay = async () => {
    if (!videoRef.current) return;
    try {
      const next = !isPlaying;
      await videoRef.current.setStatusAsync({ shouldPlay: next, volume });
      setIsPlaying(next);
    } catch (error) {
      console.error('Error toggling video playback:', error);
    }
  };

  const seekTo = async (millis: number) => {
    if (!videoRef.current || !durationMillis) return;
    const next = clamp(millis, 0, durationMillis);
    setPositionMillis(next);
    try {
      await videoRef.current.setPositionAsync(next, {
        toleranceMillisBefore: 0,
        toleranceMillisAfter: 0,
      });
    } catch (error) {
      console.error('Error seeking video:', error);
    }
  };

  const seekBy = async (deltaMillis: number) => {
    await seekTo(displayPositionMillis + deltaMillis);
  };

  const fineStepMs = fineStepUnits * 100;

  const handleStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setIsPlaying(status.isPlaying);
    setIsBuffering(Boolean(status.isBuffering));
    if (!isSeekingRef.current) {
      setPositionMillis(status.positionMillis ?? 0);
      setSeekPreviewMillis(null);
    }
    setDurationMillis(status.durationMillis ?? 0);
    setBufferedMillis(status.playableDurationMillis ?? 0);
  };

  const beginSeeking = () => {
    if (!isSeekingRef.current) {
      isSeekingRef.current = true;
      setIsSeeking(true);
    }
  };

  const endSeeking = () => {
    isSeekingRef.current = false;
    setIsSeeking(false);
  };

  const setSeekPreview = (millis: number) => {
    setSeekPreviewMillis(millis);
  };

  const setPlaybackSpeed = async (rate: number) => {
    if (!videoRef.current) return;
    try {
      setPlaybackRate(rate);
      await videoRef.current.setRateAsync(rate, true);
    } catch (error) {
      console.error('Error changing playback speed:', error);
    }
  };

  const toggleChrome = () => {
    const nextVisible = !chromeVisible;
    setChromeVisible(nextVisible);
    if (!nextVisible) {
      setShowInfo(false);
      setShowAdvancedControls(false);
    }
    chromeOpacity.value = withTiming(nextVisible ? 1 : 0, { duration: 180 });
  };

  const seekGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (!durationMillis || seekWidth <= 0) return;
      runOnJS(beginSeeking)();
      const ratio = Math.max(0, Math.min(event.x / seekWidth, 1));
      const next = ratio * durationMillis;
      runOnJS(setSeekPreview)(next);
    })
    .onEnd((event) => {
      if (!durationMillis || seekWidth <= 0) return;
      const ratio = Math.max(0, Math.min(event.x / seekWidth, 1));
      const next = ratio * durationMillis;
      runOnJS(setSeekPreview)(next);
      runOnJS(endSeeking)();
      runOnJS(seekTo)(next);
    });

  const frameBack = () => {
    void seekBy(-fineStepMs);
  };

  const frameForward = () => {
    void seekBy(fineStepMs);
  };

  const tenBack = () => {
    void seekBy(-SEEK_STEP_MS);
  };

  const tenForward = () => {
    void seekBy(SEEK_STEP_MS);
  };

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      const nextScale = savedScale.value * event.scale;
      scale.value = Math.max(1, Math.min(nextScale, 4));
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1);
      }
      savedScale.value = scale.value;
    });

  const horizontalPan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      if (scale.value > 1) {
        zoomTranslateX.value = savedZoomTranslateX.value + event.translationX;
        translateY.value = savedTranslateY.value + event.translationY;
      } else {
        swipeTranslateX.value = event.translationX;
      }
    })
    .onEnd(() => {
      if (scale.value > 1) {
        savedZoomTranslateX.value = zoomTranslateX.value;
        savedTranslateY.value = translateY.value;
        return;
      }

      if (swipeTranslateX.value < -50) {
        runOnJS(goNext)();
      } else if (swipeTranslateX.value > 50) {
        runOnJS(goPrevious)();
      }

      swipeTranslateX.value = withSpring(0);
    });

  const verticalPan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onUpdate((event) => {
      if (scale.value > 1) return;
      verticalTranslate.value = event.translationY;
      opacity.value = Math.max(0.5, 1 - Math.abs(event.translationY) / SCREEN_HEIGHT);
    })
    .onEnd((event) => {
      if (scale.value > 1) return;

      if (event.translationY > 110) {
        runOnJS(closeBySwipeDown)();
        return;
      }

      if (event.translationY < -80 || event.velocityY < -700) {
        runOnJS(showInfoBySwipeUp)();
      }

      verticalTranslate.value = withSpring(0);
      opacity.value = withSpring(1);
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        runOnJS(resetTransforms)();
      } else {
        scale.value = withSpring(2);
        savedScale.value = 2;
      }
    });

  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      runOnJS(toggleChrome)();
    });

  const tapGesture = Gesture.Exclusive(doubleTapGesture, singleTapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: scale.value > 1 ? zoomTranslateX.value : swipeTranslateX.value },
      { translateY: scale.value > 1 ? translateY.value : verticalTranslate.value },
      { scale: scale.value },
    ] as ViewStyle['transform'],
    opacity: opacity.value,
  }));

  const brightnessMaskStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(0,0,0,${1 - brightness})`,
  }));

  const chromeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: chromeOpacity.value,
  }));

  const displayPositionMillis = seekPreviewMillis ?? positionMillis;

  const handleShare = async () => {
    try {
      const shareUri = await prepareShareUri({
        assetId: currentAsset?.id,
        fallbackUri: uri,
        filename: currentAsset?.filename,
      });
      await sharePreparedUri(shareUri, 'Compartir archivo');
    } catch (error) {
      console.error('Error sharing:', error);
      Alert.alert('Error al compartir', 'No se pudo compartir este archivo.');
    }
  };

  const handleDelete = () => {
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    setShowConfirm(false);
    const success = isPrivateSource
      ? await deletePrivateById(id, isPrivateTrashSource)
      : await moveToTrash(currentAsset);
    if (success) {
      removeAssetFromGallerySession(id);
      if (galleryAssets.length <= 1) {
        router.back();
      } else if (galleryIndex >= galleryAssets.length - 1) {
        setGalleryIndex((prev) => Math.max(0, prev - 1));
      }
    } else {
      Alert.alert('Error', 'No se pudo mover a la papelera');
    }
  };

  return (
    <View style={styles.container}>
      <Animated.View pointerEvents={chromeVisible ? 'auto' : 'none'} style={[styles.header, chromeAnimatedStyle]}>
          <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={8}>
            <X color={COLORS.text} size={24} />
          </Pressable>
          <Text style={styles.counterText} numberOfLines={1}>
            {galleryAssets.length > 0 ? `${galleryIndex + 1}/${galleryAssets.length}` : '1/1'}
          </Text>
          <View style={styles.headerRight}>
            <Pressable onPress={handleShare} style={styles.iconButton} hitSlop={8}>
              <Share2 color={COLORS.text} size={24} />
            </Pressable>
            <Pressable onPress={handleDelete} style={styles.iconButton} hitSlop={8}>
              <Trash2 color={COLORS.error} size={24} />
            </Pressable>
          </View>
      </Animated.View>

      <GestureDetector
        gesture={Gesture.Simultaneous(tapGesture, pinchGesture, horizontalPan, verticalPan)}
      >
        <Animated.View style={[styles.imageContainer, animatedStyle]}>
          {isVideo ? (
            <>
              <Video
                ref={videoRef}
                source={{ uri: displayUri }}
                style={styles.video}
                useNativeControls={false}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={isPlaying}
                isLooping
                volume={volume}
                rate={playbackRate}
                shouldCorrectPitch
                onPlaybackStatusUpdate={handleStatusUpdate}
                onError={(error) => console.error('Video error:', error)}
              />
              {chromeVisible ? (
                <View style={styles.videoOverlayBadge} pointerEvents="none">
                  <Text style={styles.videoOverlayBadgeText}>
                    {formatTime(displayPositionMillis)} / {formatTime(durationMillis)}
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <Image
              source={{ uri: displayUri }}
              style={styles.image}
              contentFit="contain"
              transition={220}
              cachePolicy="disk"
            />
          )}
          <Animated.View pointerEvents="none" style={[styles.brightnessMask, brightnessMaskStyle]} />
        </Animated.View>
      </GestureDetector>

      {isVideo ? (
        <Animated.View pointerEvents={chromeVisible ? 'auto' : 'none'} style={[styles.videoControls, chromeAnimatedStyle]}>
          <View style={styles.primaryControlsRow}>
            <Pressable onPress={tenBack} style={styles.controlButton} hitSlop={6}>
              <Text style={styles.controlButtonText}>10s</Text>
            </Pressable>

            <Pressable onPress={frameBack} style={styles.controlButton} hitSlop={6}>
              <Text style={styles.controlButtonText}>◀f</Text>
            </Pressable>

            <Pressable onPress={togglePlay} style={styles.playButtonLarge}>
              {isPlaying ? <Pause color={COLORS.primary} size={28} /> : <Play color={COLORS.primary} size={28} />}
            </Pressable>

            <Pressable onPress={frameForward} style={styles.controlButton} hitSlop={6}>
              <Text style={styles.controlButtonText}>f▶</Text>
            </Pressable>

            <Pressable onPress={tenForward} style={styles.controlButton} hitSlop={6}>
              <Text style={styles.controlButtonText}>10s</Text>
            </Pressable>
          </View>

          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(displayPositionMillis)}</Text>
            <Text style={styles.timeDivider}>/</Text>
            <Text style={styles.timeTextMuted}>{formatTime(durationMillis)}</Text>
            <Pressable
              onPress={() => setShowAdvancedControls((prev) => !prev)}
              style={[styles.speedToggle, showAdvancedControls && styles.speedToggleActive]}
            >
              <Info color={showAdvancedControls ? COLORS.background : COLORS.text} size={14} />
              <Text style={[styles.speedToggleText, showAdvancedControls && styles.speedToggleTextActive]}>
                Ajustes
              </Text>
            </Pressable>
          </View>

          <GestureDetector gesture={seekGesture}>
            <View
              style={styles.seekContainer}
              onLayout={(event) => setSeekWidth(event.nativeEvent.layout.width)}
            >
              <View style={styles.seekTrack} />
              <View style={[styles.seekBuffered, { width: `${durationMillis ? Math.min(100, (bufferedMillis / durationMillis) * 100) : 0}%` }]} />
              <View style={[styles.seekPlayed, { width: `${durationMillis ? Math.min(100, (displayPositionMillis / durationMillis) * 100) : 0}%` }]} />
              <View
                style={[
                  styles.seekThumb,
                  {
                    left: `${durationMillis ? Math.min(100, (displayPositionMillis / durationMillis) * 100) : 0}%`,
                    transform: [{ scale: isSeeking ? 1.15 : 1 }],
                  },
                ]}
              />
            </View>
          </GestureDetector>

          {showAdvancedControls ? (
            <View style={styles.advancedPanel}>
              <View style={styles.advancedHeaderRow}>
                <Text style={styles.advancedTitle}>Velocidad</Text>
                <Text style={styles.bufferText}>{isBuffering ? 'Cargando...' : 'Listo'}</Text>
              </View>

              <View style={styles.rateChipsRow}>
                {SPEED_OPTIONS.map((rate) => (
                  <Pressable
                    key={rate}
                    onPress={() => setPlaybackSpeed(rate)}
                    style={[styles.rateChip, playbackRate === rate && styles.rateChipActive]}
                  >
                    <Text style={[styles.rateChipText, playbackRate === rate && styles.rateChipTextActive]}>
                      {rate}x
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.fineStepCard}>
                <View style={styles.fineStepHeader}>
                  <Text style={styles.fineStepTitle}>Salto fino</Text>
                  <Text style={styles.fineStepValue}>{fineStepUnits}/10 = {Math.round(fineStepMs)} ms</Text>
                </View>

                <View style={styles.fineStepRow}>
                  {FINE_STEP_OPTIONS.map((unit) => (
                    <Pressable
                      key={unit}
                      onPress={() => setFineStepUnits(unit)}
                      style={[styles.fineStepChip, fineStepUnits === unit && styles.fineStepChipActive]}
                    >
                      <Text
                        style={[
                          styles.fineStepChipText,
                          fineStepUnits === unit && styles.fineStepChipTextActive,
                        ]}
                      >
                        {unit}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.compactControlRow}>
                <View style={styles.compactControlLabelRow}>
                  <Volume2 color={COLORS.textMuted} size={16} />
                  <Text style={styles.controlLabel}>Vol</Text>
                </View>
                <Pressable style={styles.stepButton} onPress={() => adjustVolume(-0.1)}>
                  <Minus color={COLORS.text} size={14} />
                </Pressable>
                <View style={styles.miniMeter}>
                  <View style={[styles.miniMeterFill, { width: `${Math.round(volume * 100)}%` }]} />
                </View>
                <Pressable style={styles.stepButton} onPress={() => adjustVolume(0.1)}>
                  <Plus color={COLORS.text} size={14} />
                </Pressable>
              </View>

              <View style={styles.compactControlRow}>
                <View style={styles.compactControlLabelRow}>
                  <Info color={COLORS.textMuted} size={16} />
                  <Text style={styles.controlLabel}>Brillo</Text>
                </View>
                <Pressable style={styles.stepButton} onPress={() => adjustBrightness(-0.1)}>
                  <Minus color={COLORS.text} size={14} />
                </Pressable>
                <View style={styles.miniMeter}>
                  <View style={[styles.miniMeterFill, { width: `${Math.round(brightness * 100)}%` }]} />
                </View>
                <Pressable style={styles.stepButton} onPress={() => adjustBrightness(0.1)}>
                  <Plus color={COLORS.text} size={14} />
                </Pressable>
              </View>
            </View>
          ) : null}
        </Animated.View>
      ) : null}

      {showInfo ? (
        <View style={styles.infoModal}>
          <Pressable onPress={() => setShowInfo(false)} style={styles.infoClose}>
            <X color={COLORS.text} size={22} />
          </Pressable>
          <Text style={styles.infoTitle}>Metadatos del archivo</Text>

          <ScrollView
            style={styles.infoScroll}
            contentContainerStyle={styles.infoScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {assetInfoLoading ? <Text style={styles.infoValue}>Cargando metadatos...</Text> : null}
            {assetInfoPermissionLimited ? (
              <Text style={styles.infoValue}>Algunos metadatos avanzados requieren permiso de ubicacion multimedia.</Text>
            ) : null}

            <View style={styles.metaSection}>
              <Text style={styles.metaSectionTitle}>Resumen</Text>
              <MetaRow label="Nombre" value={filename} />
              <MetaRow label="Tipo" value={isVideo ? 'Video' : 'Foto'} />
              <MetaRow label="ID" value={currentAsset.id} />
              <MetaRow label="Creacion" value={formatDate(currentAsset.creationTime)} />
              <MetaRow label="Modificacion" value={formatDate(assetInfo?.modificationTime)} />
              <MetaRow label="Tamano" value={formatBytes((assetInfo as any)?.size)} />
              <MetaRow label="Resolucion" value={`${currentAsset.width || 0} x ${currentAsset.height || 0}`} />
              <MetaRow
                label="Duracion"
                value={isVideo ? formatTime(durationMillis || (assetInfo?.duration ?? 0) * 1000) : 'N/D'}
              />
              <MetaRow label="URI" value={currentAsset.uri} />
              <MetaRow label="Local URI" value={assetInfo?.localUri || 'N/D'} />
              <MetaRow
                label="Ubicacion"
                value={
                  assetInfo?.location
                    ? `${assetInfo.location.latitude?.toFixed(6)}, ${assetInfo.location.longitude?.toFixed(6)}`
                    : 'N/D'
                }
              />
            </View>

            <View style={styles.metaSection}>
              <Text style={styles.metaSectionTitle}>JSON Completo</Text>
              <Text style={styles.rawJsonText}>
                {JSON.stringify({ asset: currentAsset, info: assetInfo }, null, 2)}
              </Text>
            </View>
          </ScrollView>
        </View>
      ) : null}

      <Animated.View pointerEvents={chromeVisible ? 'auto' : 'none'} style={[styles.footer, chromeAnimatedStyle]}>
        {!isVideo ? (
          <View style={styles.editActionsRow}>
            <Pressable onPress={cropCenterSquare} style={styles.editActionButton} disabled={editingBusy}>
              <Crop color={COLORS.textMuted} size={16} />
              <Text style={styles.editActionText}>Recorte</Text>
            </Pressable>
            <Pressable
              onPress={() => void applyEditActions([{ rotate: 90 }])}
              style={styles.editActionButton}
              disabled={editingBusy}
            >
              <RotateCw color={COLORS.textMuted} size={16} />
              <Text style={styles.editActionText}>Girar</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                void applyEditActions([{ flip: ImageManipulatorModule?.FlipType?.Horizontal || 'horizontal' }])
              }
              style={styles.editActionButton}
              disabled={editingBusy}
            >
              <FlipHorizontal2 color={COLORS.textMuted} size={16} />
              <Text style={styles.editActionText}>Espejo</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                void applyEditActions([{ flip: ImageManipulatorModule?.FlipType?.Vertical || 'vertical' }])
              }
              style={styles.editActionButton}
              disabled={editingBusy}
            >
              <FlipVertical2 color={COLORS.textMuted} size={16} />
              <Text style={styles.editActionText}>Voltear</Text>
            </Pressable>
            <Pressable
              onPress={openSaveEditedPrompt}
              style={[styles.editActionButton, hasPendingEdits ? styles.editActionPrimary : null]}
              disabled={!hasPendingEdits || editingBusy}
            >
              <Save color={hasPendingEdits ? COLORS.background : COLORS.textMuted} size={16} />
              <Text style={[styles.editActionText, hasPendingEdits ? styles.editActionPrimaryText : null]}>
                Guardar
              </Text>
            </Pressable>
          </View>
        ) : null}
        <Pressable onPress={() => setShowInfo(true)} style={styles.infoButton}>
          <Info color={COLORS.textMuted} size={18} />
          <Text style={styles.infoText}>Ver detalles</Text>
        </Pressable>
        <Text style={styles.gestureHint}>Abajo cierra. Arriba abre info. Horizontal cambia.</Text>
      </Animated.View>

      <ConfirmationModal
        visible={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={confirmDelete}
        title={isPrivateSource ? (isPrivateTrashSource ? 'Eliminar de privadas' : 'Mover a papelera privada') : 'Mover a la papelera'}
        message={
          isPrivateSource
            ? isPrivateTrashSource
              ? 'Se eliminara del vault privado de forma permanente.'
              : 'Se movera a la papelera privada.'
            : 'La foto se podra recuperar desde la papelera durante los proximos 30 dias.'
        }
      />
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
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
  counterText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
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
  video: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  brightnessMask: {
    position: 'absolute',
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  videoControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 96,
    paddingHorizontal: SPACING.md,
    gap: 10,
  },
  primaryControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  controlButton: {
    minWidth: 42,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
  },
  controlButtonText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  playButtonLarge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  speedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  speedToggleActive: {
    backgroundColor: COLORS.primary,
  },
  speedToggleText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '700',
  },
  speedToggleTextActive: {
    color: COLORS.background,
  },
  timeBlock: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  timeTextMuted: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  timeDivider: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  pillButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  pillButtonActive: {
    backgroundColor: COLORS.primary,
  },
  seekContainer: {
    height: 26,
    justifyContent: 'center',
    marginTop: 6,
  },
  seekTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  seekBuffered: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  seekPlayed: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  seekThumb: {
    position: 'absolute',
    top: 4,
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: 'white',
  },
  advancedPanel: {
    gap: 8,
    paddingTop: 2,
  },
  advancedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  advancedTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  rateChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 4,
  },
  fineStepCard: {
    gap: 8,
    paddingHorizontal: 4,
  },
  fineStepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fineStepTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  fineStepValue: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  fineStepRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  fineStepChip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  fineStepChipActive: {
    backgroundColor: COLORS.primary,
  },
  fineStepChipText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '700',
  },
  fineStepChipTextActive: {
    color: COLORS.background,
  },
  rateChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    minWidth: 52,
    alignItems: 'center',
  },
  rateChipActive: {
    backgroundColor: COLORS.primary,
  },
  rateChipText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  rateChipTextActive: {
    color: COLORS.background,
  },
  bufferText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  compactControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  compactControlLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 62,
  },
  stepButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  miniMeter: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  miniMeterFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
  },
  videoOverlayBadge: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  videoOverlayBadgeText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  controlLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    minWidth: 34,
  },
  infoModal: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '72%',
    backgroundColor: 'rgba(0,0,0,0.95)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: SPACING.lg,
  },
  infoClose: {
    alignSelf: 'flex-end',
    marginBottom: 8,
  },
  infoTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  infoValue: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginBottom: 4,
  },
  infoScroll: {
    flexGrow: 0,
  },
  infoScrollContent: {
    gap: 12,
    paddingBottom: 8,
  },
  metaSection: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  metaSectionTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metaRow: {
    gap: 2,
  },
  metaLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metaValue: {
    color: COLORS.text,
    fontSize: 13,
  },
  rawJsonText: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'monospace',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    padding: SPACING.xl,
  },
  editActionsRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 10,
  },
  editActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  editActionPrimary: {
    backgroundColor: COLORS.primary,
  },
  editActionText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  editActionPrimaryText: {
    color: COLORS.background,
  },
  infoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  infoText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  gestureHint: {
    color: COLORS.textMuted,
    marginTop: 10,
    fontSize: 12,
  },
});
