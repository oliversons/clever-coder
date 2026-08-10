import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, LogOut, Settings, Sun, Moon, Bot } from 'lucide-react';
import { useAuthStore } from '../store';
import { useThemeStore } from '../store/themeStore';
import { motion } from 'framer-motion';
import HermesIcon from './hermes/HermesIcon';

export default function Layout() {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();

  const displayName = user?.name || user?.email || 'User';
  const initial = displayName[0]?.toUpperCase() ?? '?';

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="sidebar-logo-icon">⚡</span>
          <div className="sidebar-logo-text">
            <h2>CleverCoder</h2>
            <span>Vibe Coding Platform</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/dashboard" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <LayoutDashboard size={16} />
            Dashboard
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <Settings size={16} />
            Settings
          </NavLink>
          <NavLink to="/settings/hermes" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <Bot size={16} />
            Hermes AI
          </NavLink>
        </nav>

        <div className="sidebar-user">
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={displayName}
              style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--border)' }}
            />
          ) : (
            <div className="avatar">{initial}</div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="truncate" style={{ fontSize: 13, fontWeight: 600 }}>{displayName}</div>
            <div className="truncate" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{user?.email}</div>
          </div>

          {/* Theme Switcher Button */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            style={{ padding: '6px' }}
          >
            {theme === 'dark' ? <Sun size={15} style={{ color: 'var(--warning)' }} /> : <Moon size={15} style={{ color: 'var(--text-accent)' }} />}
          </button>

          {/* Hermes Trigger */}
          <HermesIcon compact />

          {/* Logout Button */}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              logout();
            }}
            title="Logout"
            style={{ padding: '6px' }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
}
