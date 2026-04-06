import * as MediaLibrary from 'expo-media-library';
import { PermissionsAndroid, Platform } from 'react-native';
import { useState, useEffect } from 'react';

const ANDROID_13 = 33;

export function usePermissions() {
  const [permissionResponse, setPermissionResponse] =
    useState<MediaLibrary.PermissionResponse | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [androidHasVisualSelectedPermission, setAndroidHasVisualSelectedPermission] = useState(false);

  const accessPrivileges = (permissionResponse as any)?.accessPrivileges as
    | 'all'
    | 'limited'
    | 'none'
    | undefined;
  const isLimited =
    accessPrivileges === 'limited' ||
    (Platform.OS === 'android' && accessPrivileges !== 'all' && androidHasVisualSelectedPermission);
  const isFullAccess = !isLimited && (accessPrivileges === 'all' || accessPrivileges === undefined);

  const ensureAndroidReadPermissions = async () => {
    if (Platform.OS !== 'android') return true;

    try {
      const sdkInt = Number((Platform as any).Version || 0);
      if (sdkInt >= ANDROID_13) {
        const result = await PermissionsAndroid.requestMultiple([
          'android.permission.READ_MEDIA_IMAGES' as any,
          'android.permission.READ_MEDIA_VIDEO' as any,
        ]);
        return (
          result['android.permission.READ_MEDIA_IMAGES'] === PermissionsAndroid.RESULTS.GRANTED &&
          result['android.permission.READ_MEDIA_VIDEO'] === PermissionsAndroid.RESULTS.GRANTED
        );
      }

      const legacy = await PermissionsAndroid.request('android.permission.READ_EXTERNAL_STORAGE' as any);
      return legacy === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  };

  const hasAndroidReadPermissions = async () => {
    if (Platform.OS !== 'android') return true;

    try {
      const sdkInt = Number((Platform as any).Version || 0);
      if (sdkInt >= ANDROID_13) {
        const hasImages = await PermissionsAndroid.check('android.permission.READ_MEDIA_IMAGES' as any);
        const hasVideos = await PermissionsAndroid.check('android.permission.READ_MEDIA_VIDEO' as any);
        return hasImages && hasVideos;
      }

      return await PermissionsAndroid.check('android.permission.READ_EXTERNAL_STORAGE' as any);
    } catch {
      return false;
    }
  };

  const syncAndroidLimitedInference = async () => {
    if (Platform.OS !== 'android') {
      setAndroidHasVisualSelectedPermission(false);
      return;
    }

    try {
      const hasUserSelectedOnly = await PermissionsAndroid.check('android.permission.READ_MEDIA_VISUAL_USER_SELECTED' as any);
      // On Android 14+, this permission can be granted when user picks selected media only.
      // When accessPrivileges is not explicitly "all", treat this as limited access.
      setAndroidHasVisualSelectedPermission(hasUserSelectedOnly);
    } catch {
      setAndroidHasVisualSelectedPermission(false);
    }
  };

  const checkPermissions = async () => {
    try {
      const response = await MediaLibrary.getPermissionsAsync(false, ['photo', 'video']);
      const hasNativeRead = await hasAndroidReadPermissions();
      setPermissionResponse(response);
      await syncAndroidLimitedInference();
      if (Platform.OS === 'android' && response.status === 'granted' && !hasNativeRead) {
        setPermissionError('Faltan permisos nativos de lectura para imagenes/videos');
      } else {
        setPermissionError(null);
      }
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown permission error';
      setPermissionError(message);
      return null;
    }
  };

  const requestPermission = async () => {
    try {
      await ensureAndroidReadPermissions();
      const response = await MediaLibrary.requestPermissionsAsync(false, ['photo', 'video']);
      const hasNativeRead = await hasAndroidReadPermissions();
      setPermissionResponse(response);
      await syncAndroidLimitedInference();
      if (Platform.OS === 'android' && response.status === 'granted' && !hasNativeRead) {
        setPermissionError('Faltan permisos nativos de lectura para imagenes/videos');
      } else {
        setPermissionError(null);
      }
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown permission error';
      setPermissionError(message);
      return null;
    }
  };

  useEffect(() => {
    void checkPermissions();
  }, []);

  const requestFullAccessAgain = async () => {
    try {
      if (typeof (MediaLibrary as any).presentPermissionsPickerAsync === 'function') {
        await (MediaLibrary as any).presentPermissionsPickerAsync(['photo', 'video']);
      }
    } catch {
      // If picker API is unavailable, fallback to normal permission request.
    }

    await requestPermission();
    await checkPermissions();
  };

  const isUnsupportedExpoGo =
    permissionError?.includes('Expo Go can no longer provide full access to the media library') ?? false;

  return {
    isGranted: permissionResponse?.status === 'granted',
    isLimited,
    isFullAccess: permissionResponse?.status === 'granted' && isFullAccess,
    canAskAgain: permissionResponse?.canAskAgain,
    permissionError,
    isUnsupportedExpoGo,
    checkPermissions,
    requestPermission,
    requestFullAccessAgain,
  };
}
