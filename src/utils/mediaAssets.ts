import * as MediaLibrary from 'expo-media-library';

export function getAssetIdentityKey<T extends Pick<MediaLibrary.Asset, 'id'>>(asset: T): string {
  const uri = (asset as any)?.uri ? String((asset as any).uri) : '';
  const filename = (asset as any)?.filename ? String((asset as any).filename) : '';
  const creationTime = (asset as any)?.creationTime != null ? String((asset as any).creationTime) : '';

  if (uri) {
    return `${asset.id}::${uri}`;
  }
  return `${asset.id}::${filename}::${creationTime}`;
}

// Android can occasionally return repeated rows across pagination boundaries.
// Keep first-seen order while removing true duplicates only.
// Some Android providers may reuse numeric IDs across different media tables,
// so we should not dedupe by id alone.
export function dedupeAssetsById<T extends Pick<MediaLibrary.Asset, 'id'>>(assets: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const asset of assets) {
    if (!asset?.id) continue;
    const key = getAssetIdentityKey(asset);

    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(asset);
  }

  return unique;
}
