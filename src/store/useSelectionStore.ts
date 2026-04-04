import { create } from 'zustand';

interface SelectionState {
  selectedIds: Set<string>;
  selectionMode: boolean;
  toggleSelection: (id: string) => void;
  setSelectionMode: (mode: boolean) => void;
  clearSelection: () => void;
  selectAll: (ids: string[]) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedIds: new Set<string>(),
  selectionMode: false,
  toggleSelection: (id) =>
    set((state) => {
      const newSet = new Set(state.selectedIds);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return { selectedIds: newSet, selectionMode: newSet.size > 0 };
    }),
  setSelectionMode: (mode) =>
    set((state) => ({
      selectionMode: mode,
      selectedIds: mode ? state.selectedIds : new Set()
    })),
  clearSelection: () => set({ selectedIds: new Set(), selectionMode: false }),
  selectAll: (ids) => set({ selectedIds: new Set(ids), selectionMode: true }),
}));
