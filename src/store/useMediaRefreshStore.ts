import { create } from 'zustand';

interface MediaRefreshState {
  refreshToken: number;
  bumpRefreshToken: () => void;
}

export const useMediaRefreshStore = create<MediaRefreshState>((set) => ({
  refreshToken: 0,
  bumpRefreshToken: () => set((state) => ({ refreshToken: state.refreshToken + 1 })),
}));

export const bumpMediaRefresh = () => {
  useMediaRefreshStore.getState().bumpRefreshToken();
};
