import * as MediaLibrary from 'expo-media-library';
import { useState, useEffect } from 'react';
import { useMediaRefreshStore } from '../store/useMediaRefreshStore';

export interface AlbumWithCover extends MediaLibrary.Album {
  coverUri?: string;
}

export function useAlbums(isGranted: boolean) {
  const [albums, setAlbums] = useState<AlbumWithCover[]>([]);
  const [loading, setLoading] = useState(false);
  const refreshToken = useMediaRefreshStore((state) => state.refreshToken);

  useEffect(() => {
    if (isGranted) {
      loadAlbums();
    }
  }, [isGranted, refreshToken]);

  const loadAlbums = async () => {
    setLoading(true);
    try {
      const allAlbums = await MediaLibrary.getAlbumsAsync({
        includeSmartAlbums: true,
      });

      // Obtener la portada (última foto) para cada álbum
      const albumsWithCovers = await Promise.all(
        allAlbums.map(async (album) => {
          const { assets } = await MediaLibrary.getAssetsAsync({
            album: album.id,
            first: 1,
            sortBy: [[MediaLibrary.SortBy.creationTime, false]],
          });
          return {
            ...album,
            coverUri: assets[0]?.uri,
          };
        })
      );

      // Filtrar álbumes vacíos
      setAlbums(albumsWithCovers.filter(a => a.assetCount > 0));
    } catch (error) {
      console.error('Error loading albums:', error);
    } finally {
      setLoading(false);
    }
  };

  return { albums, loading, refreshAlbums: loadAlbums };
}
