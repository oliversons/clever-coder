import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, type Project } from '../api/client';

export interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  hasGithubToken?: boolean;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  fetchMe: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: false,
      setUser: (user) => set({ user }),
      fetchMe: async () => {
        set({ isLoading: true });
        try {
          const user = await api.auth.me();
          set({ user, isLoading: false });
        } catch {
          set({ user: null, isLoading: false });
        }
      },
      logout: async () => {
        try {
          await api.auth.logout();
        } catch (err) {
          console.warn('Logout network call failed, clearing local state:', err);
        } finally {
          set({ user: null });
          localStorage.removeItem('auth-store');
          window.location.href = '/login';
        }
      },
    }),
    { name: 'auth-store', partialize: (s) => ({ user: s.user }) },
  ),
);

interface ProjectState {
  projects: Project[];
  isLoading: boolean;
  error: string | null;
  fetchProjects: () => Promise<void>;
  addProject: (p: Project) => void;
  updateProject: (p: Project) => void;
  removeProject: (id: string) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  isLoading: false,
  error: null,
  fetchProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const projects = await api.projects.list();
      set({ projects, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Error', isLoading: false });
    }
  },
  addProject: (p) => set((s) => ({ projects: [p, ...s.projects] })),
  updateProject: (p) =>
    set((s) => ({ projects: s.projects.map((x) => (x.id === p.id ? p : x)) })),
  removeProject: (id) =>
    set((s) => ({ projects: s.projects.filter((x) => x.id !== id) })),
}));
