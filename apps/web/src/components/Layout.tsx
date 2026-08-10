import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut, Github, Settings } from 'lucide-react';
import { useAuthStore } from '../store';
import { motion } from 'framer-motion';

export default function Layout() {
  const { user, logout } = useAuthStore();
  const initial = user?.email?.[0]?.toUpperCase() ?? '?';

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
        </nav>

        <div className="sidebar-user">
          <div className="avatar">{initial}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="truncate" style={{ fontSize: 13, fontWeight: 500 }}>{user?.email}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={logout} title="Logout">
            <LogOut size={14} />
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
