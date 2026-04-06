import { Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

interface PrepareShareUriOptions {
  assetId?: string;
  fallbackUri?: string;
  filename?: string;
}

const hasExtension = (name: string) => /\.[a-z0-9]{2,6}$/i.test(name);

const buildTempUri = (filename?: string) => {
  const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  const baseName = filename || 'shared-media';
  const safeName = hasExtension(baseName) ? baseName : `${baseName}.bin`;
  return `${baseDir}${Date.now()}_${safeName}`;
};

const isReadableFile = async (uri?: string | null) => {
  if (!uri) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return Boolean(info.exists && (typeof info.size !== 'number' || info.size > 0));
  } catch {
    return false;
  }
};

export async function prepareShareUri(options: PrepareShareUriOptions): Promise<string> {
  const { assetId, fallbackUri, filename } = options;

  const candidates: string[] = [];
  if (assetId) {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(assetId);
      if (info?.localUri) candidates.push(info.localUri);
      if (info?.uri) candidates.push(info.uri);
    } catch {
      // Ignore and try fallback candidates.
    }
  }
  if (fallbackUri) candidates.push(fallbackUri);

  for (const candidate of candidates) {
    if (!(await isReadableFile(candidate))) continue;
    if (candidate.startsWith('file://')) {
      return candidate;
    }

    const tmp = buildTempUri(filename || candidate.split('/').pop());
    try {
      await FileSystem.copyAsync({ from: candidate, to: tmp });
      if (await isReadableFile(tmp)) {
        return tmp;
      }
    } catch {
      // Try next candidate.
    }
  }

  throw new Error('No shareable media URI was found.');
}

export async function sharePreparedUri(shareUri: string, dialogTitle?: string): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (available) {
    await Sharing.shareAsync(shareUri, {
      dialogTitle: dialogTitle || 'Compartir archivo',
    });
    return;
  }

  await Share.share({
    title: dialogTitle || 'Compartir archivo',
    url: shareUri,
  });
}
