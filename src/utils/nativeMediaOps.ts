import * as MediaLibrary from 'expo-media-library';
import GaleriaMedia, {
  type NativeCopyAndDeleteRequest,
  type NativeCopyAndDeleteResult,
  type NativeCopyRequest,
  type NativeCopyResult,
  type NativeMoveToTrashRequest,
  type NativeMoveToTrashResult,
  type NativeRestoreRequest,
  type NativeRestoreResult,
} from '../../modules/galeria-media';

export type {
  NativeCopyAndDeleteRequest,
  NativeCopyAndDeleteResult,
  NativeCopyRequest,
  NativeCopyResult,
  NativeMoveToTrashRequest,
  NativeMoveToTrashResult,
  NativeRestoreRequest,
  NativeRestoreResult,
};

export async function deleteAssetsBatch(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;

  try {
    const deleted = await GaleriaMedia.deleteAssetsByIdsAsync(ids);
    if (typeof deleted === 'number' && deleted >= ids.length) {
      return true;
    }
  } catch {
    // Fallback to Expo MediaLibrary API below.
  }

  try {
    return await MediaLibrary.deleteAssetsAsync(ids);
  } catch {
    return false;
  }
}

export async function copyFileNative(sourceUri: string, destinationPath: string): Promise<boolean> {
  try {
    return await GaleriaMedia.copyFileToPathAsync(sourceUri, destinationPath);
  } catch {
    return false;
  }
}

export async function copyFilesNative(requests: NativeCopyRequest[]): Promise<NativeCopyResult[]> {
  if (requests.length === 0) return [];
  try {
    return await GaleriaMedia.copyFilesToPathsAsync(requests);
  } catch {
    return [];
  }
}

export async function copyFilesAndDeleteNative(
  requests: NativeCopyAndDeleteRequest[]
): Promise<NativeCopyAndDeleteResult[]> {
  if (requests.length === 0) return [];
  try {
    return await GaleriaMedia.copyFilesAndDeleteAssetsAsync(requests);
  } catch {
    return [];
  }
}

export async function moveAssetsToTrashNative(
  requests: NativeMoveToTrashRequest[]
): Promise<NativeMoveToTrashResult[]> {
  if (requests.length === 0) return [];
  try {
    return await GaleriaMedia.moveAssetsToTrashAsync(requests);
  } catch {
    return [];
  }
}

export async function restoreFilesNative(
  requests: NativeRestoreRequest[]
): Promise<NativeRestoreResult[]> {
  if (requests.length === 0) return [];
  try {
    return await GaleriaMedia.restoreFilesToLibraryAsync(requests);
  } catch {
    return [];
  }
}
