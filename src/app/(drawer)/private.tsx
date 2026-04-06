import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Share, StyleSheet, Text, TextInput, TouchableOpacity, View, Modal, AppState } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Archive, FolderInput, Lock, RotateCcw, Share2, Trash2, X, Settings, MoreVertical } from 'lucide-react-native';
import { COLORS, SPACING } from '../../constants/theme';
import { usePrivateVault } from '../../hooks/usePrivateVault';
import { useAlbumManager } from '../../hooks/useAlbumManager';
import { usePermissions } from '../../hooks/usePermissions';
import { usePrivateLockV2 } from '../../hooks/usePrivateLockV2';
import { flushJsonCacheToDisk } from '../../utils/jsonTimestampCache';
import { setGallerySession } from '../../store/gallerySession';
import { useSelectionStore } from '../../store/useSelectionStore';
import PhotoGrid from '../../components/PhotoGrid';
import AlbumManagerModal from '../../components/AlbumManagerModal';
import { usePhotoSelectionHandlers } from '../../hooks/usePhotoSelectionHandlers';

type PrivateTab = 'active' | 'archived' | 'trash';

export default function PrivateScreen() {
  const router = useRouter();
  const { isGranted } = usePermissions();
  const {
    privateItems,
    archivedPrivateItems,
    trashedPrivateItems,
    restoreManyFromPrivate,
    archiveManyPrivate,
    restoreManyArchivedToPrivate,
    moveManyPrivateToTrash,
    restoreManyPrivateFromTrash,
    deleteManyPrivate,
    refreshPrivate,
    hideInPrivate,
  } = usePrivateVault();
  const { hasPin, unlocked, setPin, unlockWithPin, changePin } = usePrivateLockV2();
  const { albums, loading: loadingAlbums, createAlbumFromAssets } = useAlbumManager(Boolean(isGranted));

  const selectionMode = useSelectionStore(state => state.selectionMode);
  const selectedIdsSet = useSelectionStore(state => state.selectedIds);
  const selectedIds = Array.from(selectedIdsSet);
  const clearSelectionStore = useSelectionStore(state => state.clearSelection);

  const [processing, setProcessing] = useState(false);
  const [processingCurrent, setProcessingCurrent] = useState(0);
  const [processingTotal, setProcessingTotal] = useState(0);
  const [showAlbumModal, setShowAlbumModal] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [autoCapturedCount, setAutoCapturedCount] = useState(0);
  const [activeTab, setActiveTab] = useState<PrivateTab>('active');

  // Change PIN modal states
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [changePinNew, setChangePinNew] = useState('');
  const [changePinConfirm, setChangePinConfirm] = useState('');
  const [changingPin, setChangingPin] = useState(false);

  const screenshotScanStartRef = useRef<number>(Date.now());
  const screenshotScanBusyRef = useRef(false);
  const handledScreenshotIdsRef = useRef<Set<string>>(new Set());

  // Save cache when app goes to background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        void flushJsonCacheToDisk();
      }
    });

    return () => subscription.remove();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      refreshPrivate();
    }, [refreshPrivate])
  );

  useEffect(() => {
    if (!unlocked || !isGranted) return;

    screenshotScanStartRef.current = Date.now();
    let cancelled = false;

    const isScreenshot = (name?: string) => {
      const normalized = (name || '').toLowerCase();
      return /screenshot|captura|screen[_ -]?shot|screencap/.test(normalized);
    };

    const scanForScreenshots = async () => {
      if (cancelled || screenshotScanBusyRef.current) return;
      screenshotScanBusyRef.current = true;

      try {
        const page = await MediaLibrary.getAssetsAsync({
          first: 40,
          mediaType: [MediaLibrary.MediaType.photo],
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        });

        let movedNow = 0;

        for (const asset of page.assets) {
          const createdAt = asset.creationTime > 1_000_000_000_000 ? asset.creationTime : asset.creationTime * 1000;
          const shouldHandle =
            createdAt >= screenshotScanStartRef.current - 2000 &&
            isScreenshot(asset.filename) &&
            !handledScreenshotIdsRef.current.has(asset.id);

          if (!shouldHandle) continue;

          handledScreenshotIdsRef.current.add(asset.id);
          const ok = await hideInPrivate(asset);
          if (ok) {
            movedNow += 1;
          }
        }

        if (movedNow > 0) {
          setAutoCapturedCount((prev) => prev + movedNow);
        }
      } catch (error) {
        console.error('Error auto-detecting screenshots in private mode:', error);
      } finally {
        screenshotScanBusyRef.current = false;
      }
    };

    void scanForScreenshots();
    const interval = setInterval(() => {
      void scanForScreenshots();
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(interval);
      screenshotScanBusyRef.current = false;
    };
  }, [hideInPrivate, isGranted, unlocked]);

  const visiblePrivateItems = useMemo(() => {
    if (activeTab === 'archived') return archivedPrivateItems;
    if (activeTab === 'trash') return trashedPrivateItems;
    return privateItems;
  }, [activeTab, archivedPrivateItems, privateItems, trashedPrivateItems]);

  const privateAssets = useMemo(
    () =>
      visiblePrivateItems.map(
        (item) =>
          ({
            id: item.id,
            uri: item.uri,
            filename: item.filename,
            mediaType: (item.filename || '').toLowerCase().match(/\.(mp4|mov|mkv|webm)$/) ? 'video' : 'photo',
            creationTime: item.hiddenAt,
          }) as MediaLibrary.Asset
      ),
    [visiblePrivateItems]
  );

  const selectedPrivateItems = useMemo(
    () => visiblePrivateItems.filter((item) => selectedIds.includes(item.id)),
    [visiblePrivateItems, selectedIds]
  );

  const clearSelection = () => {
    clearSelectionStore();
    setProcessingCurrent(0);
    setProcessingTotal(0);
  };

  const handleShareSelected = async () => {
    if (selectedPrivateItems.length === 0) return;

    try {
      clearSelection();
      setProcessing(true);

      if (selectedPrivateItems.length > 1) {
        Alert.alert('Compartir', 'Por ahora se comparte un archivo a la vez. Se abrira el primero seleccionado.');
      }

      const item = selectedPrivateItems[0];

      // Prefer a real file-backed URI (WhatsApp often fails with virtual/content URIs).
      let shareUri: string | null = null;
      try {
        const assetInfo = await MediaLibrary.getAssetInfoAsync(item.id);
        if (assetInfo?.localUri) {
          shareUri = assetInfo.localUri;
        }
      } catch {
        // Ignore; fallback to copying from stored URI below.
      }

      if (!shareUri) {
        const sourceInfo = await FileSystem.getInfoAsync(item.uri);
        if (!sourceInfo.exists) {
          Alert.alert('Error', 'El archivo no existe o fue eliminado.');
          return;
        }

        const filename = item.filename || (item.uri.split('/').pop() || 'private-file');
        const hasExt = /\.[a-z0-9]{2,6}$/i.test(filename);
        const safeName = hasExt ? filename : `${filename}.bin`;
        const tempName = `${Date.now()}_${safeName}`;
        const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        const tempUri = `${baseDir}${tempName}`;
        await FileSystem.copyAsync({ from: item.uri, to: tempUri });
        shareUri = tempUri;
      }

      if (!shareUri) {
        Alert.alert('Error', 'No se pudo preparar el archivo para compartir.');
        return;
      }

      const sharedInfo = await FileSystem.getInfoAsync(shareUri);
      if (!sharedInfo.exists || (typeof sharedInfo.size === 'number' && sharedInfo.size <= 0)) {
        Alert.alert('Error', 'El archivo a compartir esta vacio o no se pudo leer.');
        return;
      }

      await Share.share({
        title: 'Compartir archivo privado',
        url: shareUri,
      });

      clearSelection();
    } catch (error) {
      console.error('Error sharing private items:', error);
      Alert.alert(
        'Error al compartir',
        'No se pudieron compartir los archivos privados con WhatsApp o la app seleccionada. Prueba restaurándolos a la galería normal primero.',
        [{ text: 'OK' }]
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteSelected = () => {
    if (selectedPrivateItems.length === 0 || processing) return;

    const isTrashTab = activeTab === 'trash';
    Alert.alert(
      isTrashTab ? 'Eliminar permanentemente' : 'Mover a papelera privada',
      isTrashTab
        ? 'Se eliminaran los elementos seleccionados del vault privado de forma permanente.'
        : 'Los elementos seleccionados se moveran a la papelera privada.',
      [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: isTrashTab ? 'Eliminar' : 'Mover',
        style: 'destructive',
        onPress: async () => {
          try {
            clearSelection();
            setProcessing(true);
            setProcessingTotal(selectedPrivateItems.length);
            const action = isTrashTab ? deleteManyPrivate : moveManyPrivateToTrash;
            const { failed } = await action(selectedPrivateItems, (processed, total) => {
              setProcessingCurrent(processed);
              setProcessingTotal(total);
            });
            if (failed > 0) {
              Alert.alert('Atencion', `${failed} elementos no se pudieron procesar.`);
            }
          } finally {
            setProcessing(false);
          }
        },
      },
    ]);
  };

  const handleRestoreSelected = async (albumId?: string) => {
    if (selectedPrivateItems.length === 0 || processing) return;

    try {
      clearSelection();
      setProcessing(true);
      setProcessingTotal(selectedPrivateItems.length);
      const { failed } = activeTab === 'trash'
        ? await restoreManyPrivateFromTrash(selectedPrivateItems, (processed, total) => {
            setProcessingCurrent(processed);
            setProcessingTotal(total);
          })
        : await restoreManyFromPrivate(selectedPrivateItems, albumId, (processed, total) => {
            setProcessingCurrent(processed);
            setProcessingTotal(total);
          });
      setShowAlbumModal(false);
      if (failed > 0) {
        Alert.alert('Atencion', `${failed} elementos no se pudieron restaurar.`);
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleArchiveSelected = async () => {
    if (selectedPrivateItems.length === 0 || processing) return;

    try {
      clearSelection();
      setProcessing(true);
      setProcessingTotal(selectedPrivateItems.length);
      const { failed } = await archiveManyPrivate(selectedPrivateItems, (processed, total) => {
        setProcessingCurrent(processed);
        setProcessingTotal(total);
      });
      if (failed > 0) {
        Alert.alert('Atencion', `${failed} elementos no se pudieron archivar.`);
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleRestoreArchivedSelected = async () => {
    if (selectedPrivateItems.length === 0 || processing) return;

    try {
      clearSelection();
      setProcessing(true);
      setProcessingTotal(selectedPrivateItems.length);
      const { failed } = await restoreManyArchivedToPrivate(selectedPrivateItems, (processed, total) => {
        setProcessingCurrent(processed);
        setProcessingTotal(total);
      });
      if (failed > 0) {
        Alert.alert('Atencion', `${failed} elementos no se pudieron restaurar.`);
      }
    } finally {
      setProcessing(false);
    }
  };

  const { onPhotoPress: handlePhotoPressUnified, onPhotoLongPress: handlePhotoLongPressUnified } = usePhotoSelectionHandlers({
    assets: privateAssets,
    onOpenAsset: (asset, allAssets) => {
      const assetIndex = allAssets.findIndex((item) => item.id === asset.id);
      setGallerySession(allAssets);
      router.push({
        pathname: `/photo/${asset.id}`,
        params: {
          uri: (asset as any).uri,
          filename: (asset as any).filename,
          index: String(assetIndex < 0 ? 0 : assetIndex),
          source: activeTab === 'trash' ? 'private-trash' : activeTab === 'archived' ? 'private-archived' : 'private',
        },
      });
    },
  });

  const handleCreateAlbumAndRestore = async (albumName: string) => {
    if (selectedPrivateItems.length === 0 || processing) return;

    try {
      setProcessing(true);
      const pseudoAssets = selectedPrivateItems.map(
        (item) =>
          ({
            id: item.id,
            uri: item.uri,
            filename: item.filename,
            mediaType: 'photo',
            creationTime: item.hiddenAt,
          }) as MediaLibrary.Asset
      );

      const created = await createAlbumFromAssets(albumName, pseudoAssets, 'copy');
      if (!created.ok || !created.albumId) {
        Alert.alert('Error', 'No se pudo crear el album destino.');
        return;
      }

      await handleRestoreSelected(created.albumId);
    } finally {
      setProcessing(false);
    }
  };

  const handleChangePin = async () => {
    if (changePinNew !== changePinConfirm) {
      Alert.alert('Error', 'Los nuevos PIN no coinciden.');
      return;
    }

    if (changePinNew.length < 4 || changePinNew.length > 8) {
      Alert.alert('Error', 'El PIN debe tener entre 4 y 8 dígitos.');
      return;
    }

    try {
      setChangingPin(true);
      const success = await changePin(currentPinInput, changePinNew);
      if (success) {
        Alert.alert('Éxito', 'PIN actualizado correctamente.');
        setShowChangePinModal(false);
        setCurrentPinInput('');
        setChangePinNew('');
        setChangePinConfirm('');
      } else {
        Alert.alert('Error', 'PIN actual es incorrecto.');
      }
    } finally {
      setChangingPin(false);
    }
  };

  if (!hasPin) {
    return (
      <View style={styles.center}>
        <Lock size={52} color={COLORS.textMuted} />
        <Text style={styles.title}>Configura PIN de Privadas</Text>
        <Text style={styles.subtitle}>Protege tus archivos privados con un PIN de 4 a 8 digitos.</Text>
        <TextInput
          value={newPinInput}
          onChangeText={setNewPinInput}
          placeholder="PIN"
          placeholderTextColor={COLORS.textMuted}
          keyboardType="number-pad"
          secureTextEntry
          style={styles.pinInput}
        />
        <TextInput
          value={confirmPinInput}
          onChangeText={setConfirmPinInput}
          placeholder="Confirmar PIN"
          placeholderTextColor={COLORS.textMuted}
          keyboardType="number-pad"
          secureTextEntry
          style={styles.pinInput}
        />
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={async () => {
            if (newPinInput !== confirmPinInput) {
              Alert.alert('Error', 'Los PIN no coinciden.');
              return;
            }
            const ok = await setPin(newPinInput);
            if (!ok) {
              Alert.alert('Error', 'PIN invalido. Usa 4 a 8 digitos.');
            }
          }}
        >
          <Text style={styles.primaryButtonText}>Guardar PIN</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!unlocked) {
    return (
      <View style={styles.center}>
        <Lock size={52} color={COLORS.textMuted} />
        <Text style={styles.title}>Privadas bloqueadas</Text>
        <Text style={styles.subtitle}>Ingresa tu PIN para ver tus archivos privados.</Text>
        <TextInput
          value={pinInput}
          onChangeText={setPinInput}
          placeholder="PIN"
          placeholderTextColor={COLORS.textMuted}
          keyboardType="number-pad"
          secureTextEntry
          style={styles.pinInput}
        />
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={async () => {
            const ok = await unlockWithPin(pinInput);
            if (!ok) {
              Alert.alert('Error', 'PIN incorrecto.');
            }
          }}
        >
          <Text style={styles.primaryButtonText}>Desbloquear</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (visiblePrivateItems.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Privadas</Text>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowChangePinModal(true)}
          >
            <Settings size={20} color={COLORS.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.tabsRow}>
          <TouchableOpacity style={[styles.tabButton, activeTab === 'active' && styles.tabButtonActive]} onPress={() => setActiveTab('active')}>
            <Text style={[styles.tabButtonText, activeTab === 'active' && styles.tabButtonTextActive]}>Privadas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabButton, activeTab === 'archived' && styles.tabButtonActive]} onPress={() => setActiveTab('archived')}>
            <Text style={[styles.tabButtonText, activeTab === 'archived' && styles.tabButtonTextActive]}>Archivadas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabButton, activeTab === 'trash' && styles.tabButtonActive]} onPress={() => setActiveTab('trash')}>
            <Text style={[styles.tabButtonText, activeTab === 'trash' && styles.tabButtonTextActive]}>Papelera</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <Lock size={52} color={COLORS.textMuted} />
          <Text style={styles.title}>
            {activeTab === 'trash' ? 'Papelera privada vacia' : activeTab === 'archived' ? 'No hay archivos archivados' : 'No hay archivos privados'}
          </Text>
          <Text style={styles.subtitle}>
            {activeTab === 'trash'
              ? 'Los archivos eliminados de privadas apareceran aqui.'
              : activeTab === 'archived'
                ? 'Archiva fotos privadas para ocultarlas sin sacarlas del vault.'
                : 'Mantén pulsado en galeria para enviar fotos al vault privado.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with change PIN button */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Privadas</Text>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => setShowChangePinModal(true)}
        >
          <Settings size={20} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      {autoCapturedCount > 0 ? (
        <View style={styles.autoCaptureBanner}>
          <Text style={styles.autoCaptureText}>Capturas detectadas y protegidas: {autoCapturedCount}</Text>
        </View>
      ) : null}

      <View style={styles.tabsRow}>
        <TouchableOpacity style={[styles.tabButton, activeTab === 'active' && styles.tabButtonActive]} onPress={() => setActiveTab('active')}>
          <Text style={[styles.tabButtonText, activeTab === 'active' && styles.tabButtonTextActive]}>Privadas ({privateItems.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, activeTab === 'archived' && styles.tabButtonActive]} onPress={() => setActiveTab('archived')}>
          <Text style={[styles.tabButtonText, activeTab === 'archived' && styles.tabButtonTextActive]}>Archivadas ({archivedPrivateItems.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, activeTab === 'trash' && styles.tabButtonActive]} onPress={() => setActiveTab('trash')}>
          <Text style={[styles.tabButtonText, activeTab === 'trash' && styles.tabButtonTextActive]}>Papelera ({trashedPrivateItems.length})</Text>
        </TouchableOpacity>
      </View>

      {selectionMode ? (
        <View style={[styles.selectionBar, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
          <View>
            <Text style={[styles.selectionCount, { marginBottom: 0 }]}>{selectedIds.length} seleccionadas</Text>
            {processing ? (
              <Text style={[styles.processingText, { marginBottom: 0 }]}>Procesando {processingCurrent}/{processingTotal}</Text>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
            <TouchableOpacity style={styles.headerButton} onPress={() => setShowActionMenu(true)} disabled={processing}>
              <MoreVertical size={20} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerButton} onPress={clearSelection} disabled={processing}>
              <X size={20} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <PhotoGrid
        photos={privateAssets}
        loading={false}
        onLoadMore={() => undefined}
        onPhotoPress={handlePhotoPressUnified}
        onPhotoLongPress={handlePhotoLongPressUnified}
      />

      <AlbumManagerModal
        visible={showAlbumModal}
        processing={processing}
        albums={albums}
        loadingAlbums={loadingAlbums}
        onClose={() => setShowAlbumModal(false)}
        onMoveToAlbum={(albumId) => handleRestoreSelected(albumId)}
        onCreateAlbum={handleCreateAlbumAndRestore}
      />

      {/* Action Menu Modal */}
      <Modal
        visible={showActionMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowActionMenu(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowActionMenu(false)}>
          <View style={[styles.modalContent, { paddingBottom: 40 }]}>
            <Text style={styles.modalTitle}>Acciones ({selectedIds.length} items)</Text>
            
            <View style={{ gap: SPACING.md, marginTop: SPACING.md }}>
              {activeTab !== 'trash' ? (
                <TouchableOpacity 
                  style={[styles.selectionButton, { paddingVertical: 12, justifyContent: 'flex-start' }]} 
                  onPress={() => { setShowActionMenu(false); handleShareSelected(); }} 
                  disabled={processing}
                >
                  <Share2 size={20} color={COLORS.text} />
                  <Text style={[styles.selectionButtonText, { fontSize: 16 }]}>Compartir</Text>
                </TouchableOpacity>
              ) : null}
              {activeTab === 'active' ? (
                <TouchableOpacity 
                  style={[styles.selectionButton, { paddingVertical: 12, justifyContent: 'flex-start' }]} 
                  onPress={() => { setShowActionMenu(false); handleArchiveSelected(); }} 
                  disabled={processing}
                >
                  <Archive size={20} color={COLORS.text} />
                  <Text style={[styles.selectionButtonText, { fontSize: 16 }]}>Archivar</Text>
                </TouchableOpacity>
              ) : null}
              {activeTab !== 'trash' ? (
                <TouchableOpacity 
                  style={[styles.selectionButton, { paddingVertical: 12, justifyContent: 'flex-start' }]} 
                  onPress={() => { setShowActionMenu(false); setShowAlbumModal(true); }} 
                  disabled={processing}
                >
                  <FolderInput size={20} color={COLORS.text} />
                  <Text style={[styles.selectionButtonText, { fontSize: 16 }]}>Album</Text>
                </TouchableOpacity>
              ) : null}
              {activeTab === 'archived' ? (
                <TouchableOpacity 
                  style={[styles.selectionButton, { paddingVertical: 12, justifyContent: 'flex-start' }]} 
                  onPress={() => { setShowActionMenu(false); handleRestoreArchivedSelected(); }} 
                  disabled={processing}
                >
                  <RotateCcw size={20} color={COLORS.text} />
                  <Text style={[styles.selectionButtonText, { fontSize: 16 }]}>Desarchivar</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity 
                style={[styles.selectionButton, { paddingVertical: 12, justifyContent: 'flex-start' }]} 
                onPress={() => { setShowActionMenu(false); handleRestoreSelected(); }} 
                disabled={processing}
              >
                <RotateCcw size={20} color={COLORS.text} />
                <Text style={[styles.selectionButtonText, { fontSize: 16 }]}>{activeTab === 'trash' ? 'Restaurar' : 'Sacar'}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.selectionButton, styles.selectionDelete, { paddingVertical: 12, justifyContent: 'flex-start' }]} 
                onPress={() => { setShowActionMenu(false); handleDeleteSelected(); }} 
                disabled={processing}
              >
                <Trash2 size={20} color={COLORS.text} />
                <Text style={[styles.selectionButtonText, { fontSize: 16 }]}>{activeTab === 'trash' ? 'Eliminar' : 'Papelera'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Change PIN Modal */}
      <Modal
        visible={showChangePinModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowChangePinModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Cambiar PIN</Text>
            <Text style={styles.modalSubtitle}>Ingresa tu PIN actual y el nuevo PIN.</Text>

            <TextInput
              value={currentPinInput}
              onChangeText={setCurrentPinInput}
              placeholder="PIN actual"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              secureTextEntry
              style={styles.modalInput}
            />

            <TextInput
              value={changePinNew}
              onChangeText={setChangePinNew}
              placeholder="Nuevo PIN"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              secureTextEntry
              style={styles.modalInput}
            />

            <TextInput
              value={changePinConfirm}
              onChangeText={setChangePinConfirm}
              placeholder="Confirmar nuevo PIN"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              secureTextEntry
              style={styles.modalInput}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowChangePinModal(false);
                  setCurrentPinInput('');
                  setChangePinNew('');
                  setChangePinConfirm('');
                }}
                disabled={changingPin}
              >
                <Text style={styles.modalButtonText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleChangePin}
                disabled={changingPin}
              >
                <Text style={styles.modalButtonText}>{changingPin ? 'Actualizando...' : 'Actualizar PIN'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.background,
  },
  title: {
    marginTop: SPACING.md,
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: SPACING.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  pinInput: {
    width: '100%',
    maxWidth: 280,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    color: COLORS.text,
    marginTop: SPACING.sm,
  },
  primaryButton: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: COLORS.background,
    fontWeight: '700',
  },
  selectionBar: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: COLORS.border,
  },
  tabButtonActive: {
    backgroundColor: COLORS.primary,
  },
  tabButtonText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  tabButtonTextActive: {
    color: COLORS.background,
  },
  autoCaptureBanner: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: 10,
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)',
  },
  autoCaptureText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  selectionCount: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  processingText: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: 8,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  selectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    padding: 8,
    borderRadius: 10,
    backgroundColor: COLORS.border,
  },
  selectionDelete: {
    backgroundColor: COLORS.error,
  },
  selectionButtonText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
  },
  headerButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: COLORS.border,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  modalSubtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginBottom: SPACING.md,
  },
  modalInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  modalButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: COLORS.border,
  },
  modalButtonConfirm: {
    backgroundColor: COLORS.primary,
  },
  modalButtonText: {
    fontWeight: '700',
    fontSize: 14,
    color: COLORS.text,
  },
});
