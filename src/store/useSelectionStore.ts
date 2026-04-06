import { create } from 'zustand';

interface SelectionState {
  selectedIds: Set<string>;
  selectionMode: boolean;
  toggleSelection: (id: string) => void;
  select: (id: string) => void;
  selectMultiple: (ids: string[]) => void;
  setSelectionMode: (mode: boolean) => void;
  clearSelection: () => void;
  selectAll: (ids: string[]) => void;
  dragSelecting: boolean;
  setDragSelecting: (active: boolean) => void;
  dragSelectMode: 'select' | 'deselect' | null;
  beginDragSelect: (startId: string) => void;
  applyDragSelect: (id: string) => void;
  endDragSelect: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedIds: new Set<string>(),
  selectionMode: false,
  dragSelecting: false,
  dragSelectMode: null,
  toggleSelection: (id) =>
    set((state) => {
      const newSet = new Set(state.selectedIds);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return { selectedIds: newSet, selectionMode: newSet.size > 0, dragSelecting: newSet.size > 0 ? state.dragSelecting : false };
    }),
  select: (id) =>
    set((state) => {
      if (state.selectedIds.has(id)) return state;
      const newSet = new Set(state.selectedIds);
      newSet.add(id);
      return { selectedIds: newSet, selectionMode: true };
    }),
  beginDragSelect: (startId) =>
    set((state) => {
      const startingSelected = state.selectedIds.has(startId);
      const mode: 'select' | 'deselect' = startingSelected ? 'deselect' : 'select';
      const next = new Set(state.selectedIds);

      if (mode === 'select') {
        next.add(startId);
      } else {
        next.delete(startId);
      }

      return {
        selectedIds: next,
        selectionMode: next.size > 0,
        dragSelecting: true,
        dragSelectMode: mode,
      };
    }),
  applyDragSelect: (id) =>
    set((state) => {
      if (!state.dragSelecting || !state.dragSelectMode) return state;
      const next = new Set(state.selectedIds);
      if (state.dragSelectMode === 'select') {
        next.add(id);
      } else {
        next.delete(id);
      }
      return {
        selectedIds: next,
        selectionMode: next.size > 0,
      };
    }),
  endDragSelect: () => set({ dragSelecting: false, dragSelectMode: null }),
  selectMultiple: (ids) =>
    set((state) => {
      const newSet = new Set(state.selectedIds);
      ids.forEach(id => newSet.add(id));
      return { selectedIds: newSet, selectionMode: true };
    }),
  setSelectionMode: (mode) =>
    set((state) => ({
      selectionMode: mode,
      selectedIds: mode ? state.selectedIds : new Set(),
      dragSelecting: mode ? state.dragSelecting : false,
      dragSelectMode: mode ? state.dragSelectMode : null,
    })),
  clearSelection: () => set({ selectedIds: new Set(), selectionMode: false, dragSelecting: false, dragSelectMode: null }),
  selectAll: (ids) => set({ selectedIds: new Set(ids), selectionMode: true }),
  setDragSelecting: (active) => set({ dragSelecting: active }),
}));
