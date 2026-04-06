import * as MediaLibrary from 'expo-media-library';
import { useState, useEffect } from 'react';

export function usePermissions() {
  const [permissionResponse, setPermissionResponse] =
    useState<MediaLibrary.PermissionResponse | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const accessPrivileges = (permissionResponse as any)?.accessPrivileges as
    | 'all'
    | 'limited'
    | 'none'
    | undefined;
  const isLimited = accessPrivileges === 'limited';
  const isFullAccess = accessPrivileges === 'all' || accessPrivileges === undefined;

  const checkPermissions = async () => {
    try {
      const response = await MediaLibrary.getPermissionsAsync(false, ['photo', 'video']);
      setPermissionResponse(response);
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
      setPermissionError(null);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown permission error';
      setPermissionError(message);
      return null;
    }
  };

  useEffect(() => {
    checkPermissions();
  }, []);

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
  };
}
