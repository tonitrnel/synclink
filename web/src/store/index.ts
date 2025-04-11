import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface UserStore {
  access_preference: 'public' | 'private' | 'none' | undefined;
  user?: {
    name: string;
    identifier: string;
    token: string;
  };
  language: string;

  switchAccessAria(aria: 'public' | 'private'): void;
  setAccessAria(aria: 'public' | 'private' | 'none'): void;
  setLanguage(language: string): void;

  login(username: string, identifier: string, token: string): void;

  logout(): void;
}

export const useUserStore = create<UserStore>()(
  persist((set, _get) => ({
    access_preference: undefined,
    user: undefined,
    language: navigator.language,
    switchAccessAria(aria: 'public' | 'private') {
      set({ access_preference: aria });
    },
    setAccessAria(aria: 'public' | 'private' | 'none') {
      set({ access_preference: aria });
    },
    setLanguage(language: string) {
      set({ language });
    },
    login(username: string, identifier: string, token: string) {
      set({ user: { name: username, identifier, token } });
    },
    logout() {
      set({ access_preference: 'public', user: undefined });
    },
  }), {
    name: 'user',
    storage: createJSONStorage(() => localStorage)
  }),
);