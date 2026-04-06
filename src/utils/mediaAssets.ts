import * as MediaLibrary from 'expo-media-library';

// Android can occasionally return repeated rows across pagination boundaries.
// Keep first-seen order while ensuring each asset id appears only once.
export function dedupeAssetsById<T extends Pick<MediaLibrary.Asset, 'id'>>(assets: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const asset of assets) {
    if (!asset?.id || seen.has(asset.id)) continue;
    seen.add(asset.id);
    unique.push(asset);
  }

  return unique;
}
