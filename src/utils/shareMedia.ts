import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import GaleriaMedia from '../../modules/galeria-media';

interface PrepareShareUriOptions {
  assetId?: string;
  fallbackUri?: string;
  filename?: string;
}

interface PreparedShareItem {
  uri: string;
  filename: string;
  assetId?: string;
  sourceUri?: string;
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

export async function prepareShareUris(optionsList: PrepareShareUriOptions[]): Promise<PreparedShareItem[]> {
  if (Platform.OS === 'android') {
    const prepared: PreparedShareItem[] = [];
    const seen = new Set<string>();

    for (const options of optionsList) {
      const fallbackName = options.filename || options.fallbackUri?.split('/').pop() || 'shared-media.bin';
      const key = `${options.assetId || ''}::${options.fallbackUri || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);

      prepared.push({
        uri: options.fallbackUri || '',
        filename: hasExtension(fallbackName) ? fallbackName : `${fallbackName}.bin`,
        assetId: options.assetId,
        sourceUri: options.fallbackUri,
      });
    }

    return prepared;
  }

  const prepared: PreparedShareItem[] = [];
  const seen = new Set<string>();

  for (const options of optionsList) {
    const uri = await prepareShareUri(options);
    if (seen.has(uri)) continue;
    seen.add(uri);

    const fallbackName = options.filename || options.fallbackUri?.split('/').pop() || 'shared-media.bin';
    prepared.push({ uri, filename: hasExtension(fallbackName) ? fallbackName : `${fallbackName}.bin` });
  }

  return prepared;
}

async function shareFilesNativelyAndroid(items: PreparedShareItem[], dialogTitle?: string): Promise<boolean> {
  try {
    return await GaleriaMedia.shareMediaItemsAsync(
      items.map((item) => ({
        assetId: item.assetId,
        sourceUri: item.sourceUri || item.uri,
        filename: item.filename,
      })),
      dialogTitle || 'Compartir'
    );
  } catch {
    return false;
  }
}

export async function shareMediaOptions(optionsList: PrepareShareUriOptions[], dialogTitle?: string): Promise<void> {
  if (optionsList.length === 0) {
    throw new Error('No files to share.');
  }

  if (Platform.OS === 'android') {
    const launched = await GaleriaMedia.shareMediaItemsAsync(
      optionsList.map((item) => ({
        assetId: item.assetId,
        sourceUri: item.fallbackUri,
        filename: item.filename,
      })),
      dialogTitle || 'Compartir archivos'
    );

    if (launched) {
      return;
    }

    throw new Error('No se pudo iniciar el compartido en lote nativo de Android.');
  }

  const prepared = await prepareShareUris(optionsList);
  await sharePreparedUris(prepared, dialogTitle);
}

export async function sharePreparedUris(items: PreparedShareItem[], dialogTitle?: string): Promise<void> {
  if (items.length === 0) {
    throw new Error('No files to share.');
  }

  if (Platform.OS === 'android') {
    const launched = await shareFilesNativelyAndroid(items, dialogTitle || 'Compartir archivos');
    if (launched) {
      return;
    }

    // Do not fallback to per-file share sheets on Android.
    // We want one batch action only.
    throw new Error('No se pudo iniciar el compartido en lote nativo de Android.');
  }

  if (items.length === 1) {
    await sharePreparedUri(items[0].uri, dialogTitle || 'Compartir archivo');
    return;
  }

  // Non-Android fallback: share files one by one to avoid forcing ZIP packaging.
  for (const item of items) {
    await sharePreparedUri(item.uri, dialogTitle || 'Compartir archivo');
  }
}
