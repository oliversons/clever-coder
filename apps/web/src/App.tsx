import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './store';
import { useHermesStore } from './store/hermesStore';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import Workspace from './pages/Workspace';
import Settings from './pages/Settings';
import HermesSettings from './pages/HermesSettings';
import Layout from './components/Layout';
import HermesDrawer from './components/hermes/HermesDrawer';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { fetchMe, user } = useAuthStore();
  const { toggleDrawer } = useHermesStore();

  useEffect(() => {
    fetchMe();
  }, []);

  // Global keyboard shortcut: Ctrl+Shift+H to toggle Hermes drawer
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        toggleDrawer();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [toggleDrawer]);

  return (
    <>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
        <Route path="/register" element={user ? <Navigate to="/dashboard" /> : <Register />} />
        <Route
          path="/workspace/:id"
          element={<ProtectedRoute><Workspace /></ProtectedRoute>}
        />
        <Route
          path="/"
          element={<ProtectedRoute><Layout /></ProtectedRoute>}
        >
          <Route index element={<Navigate to="/dashboard" />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="settings" element={<Settings />} />
          <Route path="settings/hermes" element={<HermesSettings />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>

      {/* Hermes Drawer — portal-rendered globally, floats over all pages */}
      {user && <HermesDrawer />}
    </>
  );
}
