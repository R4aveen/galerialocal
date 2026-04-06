import { Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';

interface PrepareShareUriOptions {
  assetId?: string;
  fallbackUri?: string;
  filename?: string;
}

interface PreparedShareItem {
  uri: string;
  filename: string;
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

const sanitizeFilename = (filename: string, index: number) => {
  const safe = filename.replace(/[\\/:*?"<>|]/g, '_').trim();
  return safe.length > 0 ? safe : `media-${index + 1}.bin`;
};

async function buildZipFromPreparedItems(items: PreparedShareItem[]): Promise<string> {
  const zip = new JSZip();

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const fileBase64 = await FileSystem.readAsStringAsync(item.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    zip.file(sanitizeFilename(item.filename, i), fileBase64, { base64: true });
  }

  const outputBase64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
  const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  const zipUri = `${baseDir}${Date.now()}_galetiki-share.zip`;

  await FileSystem.writeAsStringAsync(zipUri, outputBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return zipUri;
}

export async function sharePreparedUris(items: PreparedShareItem[], dialogTitle?: string): Promise<void> {
  if (items.length === 0) {
    throw new Error('No files to share.');
  }

  if (items.length === 1) {
    await sharePreparedUri(items[0].uri, dialogTitle || 'Compartir archivo');
    return;
  }

  const zipUri = await buildZipFromPreparedItems(items);
  await sharePreparedUri(zipUri, dialogTitle || 'Compartir archivos');
}
