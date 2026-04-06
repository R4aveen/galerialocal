import * as MediaLibrary from 'expo-media-library';
import { PermissionsAndroid, Platform } from 'react-native';
import { useState, useEffect } from 'react';

export function usePermissions() {
  const [permissionResponse, setPermissionResponse] =
    useState<MediaLibrary.PermissionResponse | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [androidLimitedInference, setAndroidLimitedInference] = useState(false);

  const accessPrivileges = (permissionResponse as any)?.accessPrivileges as
    | 'all'
    | 'limited'
    | 'none'
    | undefined;
  const isLimited = accessPrivileges === 'limited' || androidLimitedInference;
  const isFullAccess = !isLimited && (accessPrivileges === 'all' || accessPrivileges === undefined);

  const syncAndroidLimitedInference = async () => {
    if (Platform.OS !== 'android') {
      setAndroidLimitedInference(false);
      return;
    }

    try {
      const hasUserSelectedOnly = await PermissionsAndroid.check('android.permission.READ_MEDIA_VISUAL_USER_SELECTED' as any);
      const hasImages = await PermissionsAndroid.check('android.permission.READ_MEDIA_IMAGES' as any);
      const hasVideo = await PermissionsAndroid.check('android.permission.READ_MEDIA_VIDEO' as any);
      // If Android granted only user-selected media access, WhatsApp/device folders can be missing.
      setAndroidLimitedInference(hasUserSelectedOnly && (!hasImages || !hasVideo));
    } catch {
      setAndroidLimitedInference(false);
    }
  };

  const checkPermissions = async () => {
    try {
      const response = await MediaLibrary.getPermissionsAsync(false, ['photo', 'video']);
      setPermissionResponse(response);
      await syncAndroidLimitedInference();
      setPermissionError(null);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown permission error';
      setPermissionError(message);
      return null;
    }
  };

  const requestPermission = async () => {
    try {
      const response = await MediaLibrary.requestPermissionsAsync(false, ['photo', 'video']);
      setPermissionResponse(response);
      await syncAndroidLimitedInference();
      setPermissionError(null);
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
