import * as MediaLibrary from 'expo-media-library';
import { useState, useEffect, useCallback } from 'react';

export function useMediaLibrary(isGranted: boolean) {
  const [photos, setPhotos] = useState<MediaLibrary.Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [endCursor, setEndCursor] = useState<string | undefined>(undefined);

  const loadPhotos = useCallback(async (after?: string) => {
    if (!isGranted || loading || (!after && photos.length > 0)) return;

    setLoading(true);
    try {
      const { assets, hasNextPage: next, endCursor: cursor } = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        first: 50,
        after,
      });

      setPhotos(prev => (after ? [...prev, ...assets] : assets));
      setHasNextPage(next);
      setEndCursor(cursor);
    } catch (error) {
      console.error('Error loading photos:', error);
    } finally {
      setLoading(false);
    }
  }, [isGranted, loading, photos.length]);

  useEffect(() => {
    if (isGranted) {
      loadPhotos();
    }
  }, [isGranted]);

  const loadMore = () => {
    if (hasNextPage && endCursor) {
      loadPhotos(endCursor);
    }
  };

  return { photos, loading, loadMore };
}
