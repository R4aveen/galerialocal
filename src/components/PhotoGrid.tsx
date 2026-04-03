import React from 'react';
import { Dimensions, StyleSheet, View, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import * as MediaLibrary from 'expo-media-library';
import PhotoThumbnail from './PhotoThumbnail';
import { COLORS } from '../constants/theme';

const COLUMNS = 3;
const SCREEN_WIDTH = Dimensions.get('window').width;
const ITEM_SIZE = SCREEN_WIDTH / COLUMNS;

interface Props {
  photos: MediaLibrary.Asset[];
  onLoadMore: () => void;
  onPhotoPress: (asset: MediaLibrary.Asset) => void;
  loading: boolean;
}

export default function PhotoGrid({ photos, onLoadMore, onPhotoPress, loading }: Props) {
  return (
    <View style={styles.container}>
      <FlashList
        data={photos}
        numColumns={COLUMNS}
        estimatedItemSize={ITEM_SIZE}
        renderItem={({ item }: any) => (
          <PhotoThumbnail 
            asset={item} 
            size={ITEM_SIZE} 
            onPress={onPhotoPress} 
          />
        )}
        keyExtractor={(item: any) => item.id}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={() => (
          loading ? (
            <View style={styles.footer}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : null
        )}
        {...({} as any)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
});
