import { requireNativeModule } from 'expo-modules-core';

export interface NativePagedAsset {
  id: string;
  uri: string;
  filename?: string;
  mediaType?: 'photo' | 'video';
  creationTime?: number;
  modificationTime?: number;
  mimeType?: string;
}

export interface NativeCopyRequest {
  sourceUri: string;
  destinationPath: string;
}

export interface NativeMoveToTrashRequest {
  assetId: string;
  destinationPath: string;
}

export interface NativeMoveToTrashResult extends NativeMoveToTrashRequest {
  copied: boolean;
  deleted: boolean;
  sourceUri?: string | null;
}

export interface NativeRestoreRequest {
  itemId: string;
  sourcePath: string;
  filename?: string;
}

export interface NativeRestoreResult {
  itemId: string;
  restored: boolean;
  createdUri?: string | null;
  assetId?: string | null;
}

export interface NativeCopyResult extends NativeCopyRequest {
  copied: boolean;
}

export interface NativeCopyAndDeleteRequest extends NativeCopyRequest {
  assetId: string;
}

export interface NativeCopyAndDeleteResult {
  assetId: string;
  destinationPath: string;
  copied: boolean;
  deleted: boolean;
}

export interface NativeShareRequest {
  uri: string;
  filename?: string;
}

export interface NativeShareMediaRequest {
  assetId?: string;
  sourceUri?: string;
  filename?: string;
}

export interface NativePagedChunkOptions {
  page: number;
  pageSize: number;
  mediaFilter: string;
  sortOrder: string;
}

export interface NativeStorageStats {
  totalBytes: number;
  freeBytes: number;
  cacheBytes: number;
  appBytes: number;
}

export interface NativeCacheTrimResult {
  freedBytes: number;
  cacheBytesAfter: number;
}

interface GaleriaMediaModule {
  getGroupedAssetsAsync(filter: string): Promise<Array<Record<string, unknown>>>;
  getPagedAssetsAsync(limit: number, mediaFilter: string, sortOrder: string): Promise<NativePagedAsset[]>;
  getPagedAssetsChunkAsync(options: NativePagedChunkOptions): Promise<NativePagedAsset[]>;
  getAppStorageStatsAsync(): Promise<NativeStorageStats>;
  trimAppCacheAsync(options?: { maxBytes?: number; maxAgeMs?: number }): Promise<NativeCacheTrimResult>;
  clearAppCacheAsync(): Promise<NativeCacheTrimResult>;
  deleteAssetsByIdsAsync(ids: string[]): Promise<number>;
  shareFilesAsync(requests: NativeShareRequest[], dialogTitle?: string): Promise<boolean>;
  shareMediaItemsAsync(requests: NativeShareMediaRequest[], dialogTitle?: string): Promise<boolean>;
  restoreFilesToLibraryAsync(requests: NativeRestoreRequest[]): Promise<NativeRestoreResult[]>;
  moveAssetsToTrashAsync(requests: NativeMoveToTrashRequest[]): Promise<NativeMoveToTrashResult[]>;
  copyFileToPathAsync(sourceUri: string, destinationPath: string): Promise<boolean>;
  copyFilesToPathsAsync(requests: NativeCopyRequest[]): Promise<NativeCopyResult[]>;
  copyFilesAndDeleteAssetsAsync(requests: NativeCopyAndDeleteRequest[]): Promise<NativeCopyAndDeleteResult[]>;
}

export default requireNativeModule<GaleriaMediaModule>('GaleriaMedia');
