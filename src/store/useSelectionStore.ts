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
  dragAnchorIndex: number | null;
  dragLastFrom: number | null;
  dragLastTo: number | null;
  dragOrderedIds: string[];
  dragBaseSelectedIds: Set<string>;
  beginDragSelect: (startId: string, startIndex: number, orderedIds: string[]) => void;
  applyDragSelect: (currentIndex: number) => void;
  endDragSelect: () => void;
}

const setsEqual = (a: Set<string>, b: Set<string>) => {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
};

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedIds: new Set<string>(),
  selectionMode: false,
  dragSelecting: false,
  dragSelectMode: null,
  dragAnchorIndex: null,
  dragLastFrom: null,
  dragLastTo: null,
  dragOrderedIds: [],
  dragBaseSelectedIds: new Set<string>(),
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
  beginDragSelect: (startId, startIndex, orderedIds) =>
    set((state) => {
      const startingSelected = state.selectedIds.has(startId);
      const mode: 'select' | 'deselect' = startingSelected ? 'deselect' : 'select';
      const base = new Set(state.selectedIds);
      const next = new Set(base);
      // Include anchor item immediately so user gets instant visual feedback.
      if (mode === 'select') next.add(startId);
      else next.delete(startId);

      return {
        selectedIds: next,
        selectionMode: next.size > 0,
        dragSelecting: true,
        dragSelectMode: mode,
        dragAnchorIndex: startIndex,
        dragLastFrom: startIndex,
        dragLastTo: startIndex,
        dragOrderedIds: orderedIds,
        dragBaseSelectedIds: base,
      };
    }),
  applyDragSelect: (currentIndex) =>
    set((state) => {
      if (!state.dragSelecting || !state.dragSelectMode) return state;
      if (state.dragAnchorIndex == null || state.dragOrderedIds.length === 0) return state;

      const orderedIds = state.dragOrderedIds;
      const anchor = Math.max(0, Math.min(orderedIds.length - 1, state.dragAnchorIndex));
      const current = Math.max(0, Math.min(orderedIds.length - 1, currentIndex));
      const newFrom = Math.min(anchor, current);
      const newTo = Math.max(anchor, current);

      if (state.dragLastFrom === newFrom && state.dragLastTo === newTo) {
        return state;
      }

      const oldFrom = state.dragLastFrom ?? anchor;
      const oldTo = state.dragLastTo ?? anchor;

      // Copy once and update only the delta between old and new ranges.
      const next = new Set(state.selectedIds);

      const applyMode = (id: string) => {
        if (state.dragSelectMode === 'select') next.add(id);
        else next.delete(id);
      };

      const revertToBase = (id: string) => {
        if (state.dragBaseSelectedIds.has(id)) next.add(id);
        else next.delete(id);
      };

      // Left boundary delta.
      if (newFrom < oldFrom) {
        for (let i = newFrom; i < oldFrom; i += 1) {
          const id = orderedIds[i];
          if (!id) continue;
          applyMode(id);
        }
      } else if (newFrom > oldFrom) {
        for (let i = oldFrom; i < newFrom; i += 1) {
          const id = orderedIds[i];
          if (!id) continue;
          revertToBase(id);
        }
      }

      // Right boundary delta.
      if (newTo > oldTo) {
        for (let i = oldTo + 1; i <= newTo; i += 1) {
          const id = orderedIds[i];
          if (!id) continue;
          applyMode(id);
        }
      } else if (newTo < oldTo) {
        for (let i = newTo + 1; i <= oldTo; i += 1) {
          const id = orderedIds[i];
          if (!id) continue;
          revertToBase(id);
        }
      }

      if (setsEqual(next, state.selectedIds)) {
        return {
          dragLastFrom: newFrom,
          dragLastTo: newTo,
        };
      }

      return {
        selectedIds: next,
        // Keep selection mode active while finger is dragging, even if temporary count hits 0.
        selectionMode: true,
        dragLastFrom: newFrom,
        dragLastTo: newTo,
      };
    }),
  endDragSelect: () =>
    set((state) => ({
      dragSelecting: false,
      dragSelectMode: null,
      dragAnchorIndex: null,
      dragLastFrom: null,
      dragLastTo: null,
      dragOrderedIds: [],
      dragBaseSelectedIds: new Set<string>(),
      selectionMode: state.selectedIds.size > 0,
    })),
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
      dragAnchorIndex: mode ? state.dragAnchorIndex : null,
      dragLastFrom: mode ? state.dragLastFrom : null,
      dragLastTo: mode ? state.dragLastTo : null,
      dragOrderedIds: mode ? state.dragOrderedIds : [],
      dragBaseSelectedIds: mode ? state.dragBaseSelectedIds : new Set<string>(),
    })),
  clearSelection: () =>
    set({
      selectedIds: new Set(),
      selectionMode: false,
      dragSelecting: false,
      dragSelectMode: null,
      dragAnchorIndex: null,
      dragLastFrom: null,
      dragLastTo: null,
      dragOrderedIds: [],
      dragBaseSelectedIds: new Set<string>(),
    }),
  selectAll: (ids) => set({ selectedIds: new Set(ids), selectionMode: true }),
  setDragSelecting: (active) => set({ dragSelecting: active }),
}));
