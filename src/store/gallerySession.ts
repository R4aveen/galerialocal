import * as MediaLibrary from 'expo-media-library';

let galleryAssets: MediaLibrary.Asset[] = [];

export function setGallerySession(assets: MediaLibrary.Asset[]) {
  galleryAssets = assets;
}

export function getGallerySession() {
  return galleryAssets;
}

export function removeAssetFromGallerySession(assetId: string) {
  galleryAssets = galleryAssets.filter((asset) => asset.id !== assetId);
}

export function replaceAssetInGallerySession(previousId: string, nextAsset: MediaLibrary.Asset) {
  galleryAssets = galleryAssets.map((asset) => (asset.id === previousId ? nextAsset : asset));
}
