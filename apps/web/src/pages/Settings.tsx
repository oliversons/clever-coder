import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Sun, Moon, Github, Shield, User as UserIcon, Check, HardDrive,
  Palette as PaletteIcon, Snowflake, Flame, Zap, Droplets, Trees, Heart, Sparkles, Bot,
  Crown, Waves, Leaf, Compass, Award, LayoutGrid, Layers, Square, CircleDot, MinusSquare, Box,
  type LucideIcon
} from 'lucide-react';
import { useAuthStore } from '../store';
import { useThemeStore, type Palette, type ThemeStyle } from '../store/themeStore';
import { api, openGithubOAuthPopup } from '../api/client';

export interface ThemeStyleOption {
  id: ThemeStyle;
  name: string;
  badge?: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  cardRadius: string;
  btnRadius: string;
  inputRadius: string;
  badgeRadius: string;
  elevation: string;
}

export const THEME_STYLES: ThemeStyleOption[] = [
  {
    id: 'mui_material',
    name: 'Official Material UI (MUI)',
    badge: 'MUI v5 Spec',
    tagline: 'Authentic Material-UI Paper elevation, uppercase buttons, outlined textfields',
    description: '100% faithful to official MUI v5 (Material Design). Features 4px Paper elevation shadows, uppercase buttons (letter-spacing: 0.028em), outlined inputs, 16px capsule chips, and Material drawer navigation.',
    icon: Layers,
    cardRadius: '4px',
    btnRadius: '4px',
    inputRadius: '4px',
    badgeRadius: '16px Chip',
    elevation: 'MUI Paper Elevation 1-4',
  },
  {
    id: 'material_clean',
    name: 'Material Modern (Materialize)',
    badge: 'Popular',
    tagline: 'Clean solid surfaces, ambient drop shadows, crisp SaaS structure',
    description: 'Inspired by modern SaaS dashboards (Materialize). Features solid elevated surfaces, 12px smooth corners, refined 8px outlined inputs, pill badges, and zero blur distortion.',
    icon: LayoutGrid,
    cardRadius: '12px',
    btnRadius: '8px',
    inputRadius: '8px',
    badgeRadius: 'Pill (9999px)',
    elevation: 'Ambient Shadow (0 4px 18px)',
  },
  {
    id: 'glassmorphism',
    name: 'Cyberpunk Glass Frost',
    tagline: 'Translucent frosted glass with vibrant neon edge glow',
    description: 'Futuristic glass aesthetics featuring 20px backdrop blur, semi-transparent frosted card bodies, glowing neon shadow highlights, and rounded 16px corners.',
    icon: Sparkles,
    cardRadius: '16px',
    btnRadius: '12px',
    inputRadius: '12px',
    badgeRadius: 'Pill (9999px)',
    elevation: 'Backdrop Blur (20px) + Glow',
  },
  {
    id: 'neo_brutalism',
    name: 'Neo-Brutalist Geometric',
    tagline: 'Bold 2px solid contrast borders and hard 4px offset shadows',
    description: 'High-contrast tactile brutalist style with sharp 2px corners, solid structural borders, offset drop shadows without blur, and bold typography.',
    icon: Square,
    cardRadius: '2px',
    btnRadius: '2px',
    inputRadius: '2px',
    badgeRadius: '2px Sharp',
    elevation: 'Hard 4px Offset Drop Shadow',
  },
  {
    id: 'soft_pill',
    name: 'Soft Rounded & Organic',
    tagline: 'Cupertino tactile curves, pill buttons, and smooth fluid contours',
    description: 'Ultra-friendly fluid design with sweeping 24px card curves, full capsule pill buttons (9999px), inset input shadows, and soft ambient shadows.',
    icon: CircleDot,
    cardRadius: '24px',
    btnRadius: 'Pill (9999px)',
    inputRadius: 'Pill (9999px)',
    badgeRadius: 'Pill (9999px)',
    elevation: 'Diffuse Floating Elevation',
  },
  {
    id: 'minimal_flat',
    name: 'Swiss Minimalist Flat',
    tagline: 'Zero drop-shadows, 1px hairline dividers, structured clarity',
    description: 'High-density utilitarian minimalism with 0px shadows, clean 1px hairline borders, compact 4px-6px radii, and distraction-free contrast.',
    icon: MinusSquare,
    cardRadius: '6px',
    btnRadius: '4px',
    inputRadius: '4px',
    badgeRadius: '4px Subtly Rounded',
    elevation: 'Flat 1px Hairline Dividers',
  },
];

interface PaletteOption {
  id: Palette;
  name: string;
  category: 'featured' | 'cold' | 'warm' | 'classic';
  description: string;
  icon: LucideIcon;
  colorsDark: string[];
  colorsLight: string[];
}

const PALETTES: PaletteOption[] = [
  // ─── 1. Featured Luxury & Designer Palettes ───
  {
    id: 'gold_elegance',
    name: 'Black & Gold Elegance',
    category: 'featured',
    description: 'High-luxury deep pitch black and midnight navy with radiant amber gold and platinum highlights.',
    icon: Crown,
    colorsDark: ['#050811', '#fca311', '#14213d', '#e5e5e5'],
    colorsLight: ['#f8fafc', '#d97706', '#14213d', '#ffffff'],
  },
  {
    id: 'sapphire_quicksand',
    name: 'Sapphire & Quicksand Luxe',
    category: 'featured',
    description: 'Watchmaking sapphire royal blue with quicksand champagne gold and swan wing alabaster.',
    icon: Award,
    colorsDark: ['#09122c', '#e0c58f', '#3c507d', '#f5f0e9'],
    colorsLight: ['#f5f0e9', '#112250', '#c7a86b', '#3c507d'],
  },
  {
    id: 'deep_azure_jade',
    name: 'Deep Azure & Jade',
    category: 'featured',
    description: 'Deep azure midnight slate with rich nautical teal, pale jade mint, and clean pale teal white.',
    icon: Compass,
    colorsDark: ['#0b1521', '#345b63', '#d4ecdd', '#f8fffe'],
    colorsLight: ['#f8fffe', '#152d35', '#345b63', '#d4ecdd'],
  },
  {
    id: 'midnight_violet_seashell',
    name: 'Midnight Violet & Seashell',
    category: 'featured',
    description: 'Royal midnight violet plum with French blue, glacial powder blue, and warm seashell wheat.',
    icon: Sparkles,
    colorsDark: ['#1f0a1a', '#f6e0b6', '#3e4b8e', '#fff4eb'],
    colorsLight: ['#fff4eb', '#3d1534', '#3e4b8e', '#f6e0b6'],
  },
  {
    id: 'coral_turquoise',
    name: 'Coral & Turquoise Navy',
    category: 'featured',
    description: 'Vivid neon coral red with crisp turquoise aqua, deep navy slate, and pure porcelain white.',
    icon: Zap,
    colorsDark: ['#001721', '#f7444e', '#78bcc4', '#f7f8f3'],
    colorsLight: ['#f7f8f3', '#f7444e', '#002c3e', '#78bcc4'],
  },
  {
    id: 'blush_pink',
    name: 'Blush Pink & Velvet Plum',
    category: 'featured',
    description: 'Deep velvet plum and dark rose night with vivid blush pink, blossom tones, and hot magenta.',
    icon: Heart,
    colorsDark: ['#140409', '#ec4899', '#f472b6', '#fdf2f8'],
    colorsLight: ['#fdf2f8', '#be185d', '#ec4899', '#831843'],
  },
  {
    id: 'teal_harmony',
    name: 'Teal Harmony & Mint',
    category: 'featured',
    description: 'Deep emerald teal harmony with vivid mint aqua, glacial cyan, and crisp arctic white.',
    icon: Trees,
    colorsDark: ['#041614', '#2dd4bf', '#1488a6', '#ecfeff'],
    colorsLight: ['#ecfeff', '#134e4a', '#1488a6', '#ccfbf1'],
  },
  {
    id: 'fiery_ocean',
    name: 'Fiery Ocean',
    category: 'featured',
    description: 'Prussian deep ocean navy with vivid scarlet crimson flame, glacier blue, and warm cream alabaster.',
    icon: Flame,
    colorsDark: ['#00121e', '#c1121f', '#669bbc', '#fdf0d5'],
    colorsLight: ['#faf6ee', '#c1121f', '#003049', '#669bbc'],
  },
  {
    id: 'crimson_twilight',
    name: 'Crimson Twilight',
    category: 'featured',
    description: 'Deep twilight indigo navy with rich wine crimson, warm sand linen, and soft snow pearl typography.',
    icon: Compass,
    colorsDark: ['#0e1424', '#c53030', '#2a3b64', '#faf3f3'],
    colorsLight: ['#faf7f5', '#9e2121', '#2a3b64', '#e7e1d9'],
  },
  {
    id: 'oceanic_wave',
    name: 'Deep Oceanic Wave',
    category: 'featured',
    description: 'Abyssal midnight sea with Nordic steel blue, frosted powder cyan waves, and arctic mist white text.',
    icon: Waves,
    colorsDark: ['#040a14', '#4a7fa7', '#1a3d63', '#f6fafd'],
    colorsLight: ['#f6fafd', '#1a3d63', '#4a7fa7', '#b3cfe5'],
  },
  {
    id: 'forest_sage',
    name: 'Forest Sage & Obsidian',
    category: 'featured',
    description: 'Obsidian charcoal black and deep forest evergreen with mineral sage grey and muted moss olive accents.',
    icon: Leaf,
    colorsDark: ['#0a0c09', '#7e9466', '#38472a', '#fdfdfd'],
    colorsLight: ['#f7f8f6', '#38472a', '#6d7e5a', '#111111'],
  },
  {
    id: 'espresso_silk',
    name: 'Espresso & Silk Luxury',
    category: 'featured',
    description: 'Rich dark roast espresso and timber bronze with cashmere sand, silk gold, and pearl white.',
    icon: Award,
    colorsDark: ['#180804', '#e4cdae', '#7f5a3f', '#fffff4'],
    colorsLight: ['#fffff4', '#2d1008', '#7f5a3f', '#e4cdae'],
  },
  {
    id: 'blood_water',
    name: 'Blood & Water',
    category: 'featured',
    description: 'Vivid scarlet blood red with steel blue, glacier water, nautical navy, and warm alabaster.',
    icon: Droplets,
    colorsDark: ['#0b1726', '#df3431', '#718bae', '#faf5dd'],
    colorsLight: ['#faf5dd', '#df3431', '#2a4b71', '#d9edec'],
  },
  {
    id: 'dusk_mauve',
    name: 'Dusk Mauve & Coral',
    category: 'featured',
    description: 'Calm and sophisticated dusk navy with mauve purple, warm coral highlights, and peach alabaster.',
    icon: Moon,
    colorsDark: ['#0e0f1c', '#f08a8a', '#6d5ba6', '#ffd6c9'],
    colorsLight: ['#fcf7f5', '#42426f', '#d9534f', '#ffd6c9'],
  },
  {
    id: 'sunset_velvet',
    name: 'Sunset Velvet & Apricot',
    category: 'featured',
    description: 'Deep velvet plum indigo with rose terracotta, warm apricot gold, and rich linen cream.',
    icon: Sun,
    colorsDark: ['#1f1320', '#e9b57c', '#b8535a', '#e8ddc9'],
    colorsLight: ['#faf6f0', '#553a59', '#b8535a', '#e9b57c'],
  },
  {
    id: 'lavender_dream',
    name: 'Lavender Dream & Violet',
    category: 'featured',
    description: 'Dreamy soft lavender and royal violet with pastel lilac tones and elegant violet glow.',
    icon: Sparkles,
    colorsDark: ['#110d22', '#b9a7e0', '#7d6cc4', '#f6f2fb'],
    colorsLight: ['#f6f2fb', '#5e4b8b', '#7d6cc4', '#e7d6f7'],
  },

  // ─── Cold Palettes ───
  {
    id: 'ocean',
    name: 'Ocean Sapphire',
    category: 'cold',
    description: 'Deep abyss navy with royal sapphire blue and crystalline sky accents.',
    icon: Droplets,
    colorsDark: ['#091322', '#2563eb', '#38bdf8'],
    colorsLight: ['#ffffff', '#1d4ed8', '#0284c7'],
  },
  {
    id: 'nordic',
    name: 'Nordic Ice',
    category: 'cold',
    description: 'Arctic frost slate with crisp glacial cyan and polar teal gradients.',
    icon: Snowflake,
    colorsDark: ['#0b161f', '#06b6d4', '#14b8a6'],
    colorsLight: ['#ffffff', '#0891b2', '#0d9488'],
  },
  {
    id: 'emerald',
    name: 'Emerald Forest',
    category: 'cold',
    description: 'Deep pine greens with vivid emerald gemstones and refreshing mint highlights.',
    icon: Trees,
    colorsDark: ['#081a10', '#10b981', '#34d399'],
    colorsLight: ['#ffffff', '#059669', '#0891b2'],
  },

  // ─── Warm Palettes ───
  {
    id: 'rose',
    name: 'Crimson Sunset',
    category: 'warm',
    description: 'Midnight berry with intense ruby rose and warm coral pink tones.',
    icon: Heart,
    colorsDark: ['#1c0a13', '#f43f5e', '#fb7185'],
    colorsLight: ['#ffffff', '#e11d48', '#f43f5e'],
  },
  {
    id: 'amber',
    name: 'Amber Gold',
    category: 'warm',
    description: 'Dark bronze with rich golden amber and radiant honey highlights.',
    icon: Sun,
    colorsDark: ['#1c1507', '#f59e0b', '#fbbf24'],
    colorsLight: ['#ffffff', '#d97706', '#f59e0b'],
  },
  {
    id: 'volcanic',
    name: 'Volcanic Clay',
    category: 'warm',
    description: 'Obsidian earth with burnt terracotta, magma orange, and fiery red accents.',
    icon: Flame,
    colorsDark: ['#1c0c08', '#ea580c', '#f97316'],
    colorsLight: ['#ffffff', '#c2410c', '#ea580c'],
  },

  // ─── Classic & Cyberpunk ───
  {
    id: 'default',
    name: 'Electric Violet & Cyan',
    category: 'classic',
    description: 'Classic cyberpunk coding palette with electric violet, cyan, and neon glow.',
    icon: Sparkles,
    colorsDark: ['#0d1117', '#7c3aed', '#06b6d4'],
    colorsLight: ['#ffffff', '#6d28d9', '#0891b2'],
  },
  {
    id: 'orange',
    name: 'Solar Orange',
    category: 'classic',
    description: 'High-energy cyberpunk carbon with blazing solar orange and tangerine neon.',
    icon: Zap,
    colorsDark: ['#180f06', '#ff6b00', '#ff9e00'],
    colorsLight: ['#ffffff', '#e65100', '#ff6b00'],
  },
];

export default function Settings() {
  const { user, setUser, logout } = useAuthStore();
  const { theme, palette, themeStyle, setTheme, setPalette, setThemeStyle } = useThemeStore();
  const navigate = useNavigate();
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleConnectGithub = () => {
    setConnecting(true);
    setMessage(null);
    openGithubOAuthPopup(async () => {
      try {
        const u = await api.auth.me();
        setUser(u);
        setMessage({ type: 'success', text: 'GitHub account connected and saved to your profile in database!' });
      } catch (err) {
        setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to connect GitHub' });
      } finally {
        setConnecting(false);
      }
    });
  };

  const handleDisconnectGithub = async () => {
    if (!confirm('Are you sure you want to disconnect your GitHub account from your profile?')) return;
    setConnecting(true);
    try {
      await api.auth.disconnectGithub();
      const u = await api.auth.me();
      setUser(u);
      setMessage({ type: 'success', text: 'GitHub account disconnected from your database profile.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to disconnect GitHub' });
    } finally {
      setConnecting(false);
    }
  };

  const initial = user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? '?';

  return (
    <div style={{ width: '100%', minHeight: '100%', paddingBottom: 60 }}>
      <div className="page-header" style={{ marginBottom: 28 }}>
        <div>
          <h1 className="page-title">Platform Settings</h1>
          <p className="page-subtitle">Configure UI architecture, themes, GitHub integration, and account preferences</p>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${message.type} mb-6`}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* ─── 0. UI Architecture & Shape System Studio ─────────────────── */}
        <section className="glass-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-accent)'
              }}>
                <Layers size={20} />
              </div>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700 }}>UI Architecture &amp; Shape System</h2>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Change the geometric shape, corner radii, elevation shadows, and input form factors on the fly
                </p>
              </div>
            </div>

            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-full)', border: '1px solid var(--border)',
              fontSize: 12, fontWeight: 600, color: 'var(--text-accent)',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <Box size={14} /> Active Style: {THEME_STYLES.find(s => s.id === themeStyle)?.name ?? 'Material Modern'}
            </div>
          </div>

          {/* Theme Style Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {THEME_STYLES.map((st) => (
              <ThemeStyleCard
                key={st.id}
                styleOption={st}
                active={themeStyle === st.id}
                theme={theme}
                onSelect={() => setThemeStyle(st.id)}
              />
            ))}
          </div>
        </section>

        {/* ─── 1. Appearance / Multi-Palette Theme Studio ───────────────── */}
        <section className="glass-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-accent)'
              }}>
                <PaletteIcon size={20} />
              </div>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700 }}>Color Palette &amp; Mode Studio</h2>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Choose from 24 curated luxury, cold, warm, and designer palettes in both Dark and Light modes
                </p>
              </div>
            </div>

            {/* Mode Switcher Buttons */}
            <div style={{
              display: 'flex', background: 'var(--bg-elevated)', padding: 4,
              borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', gap: 4
            }}>
              <button
                type="button"
                className={`btn btn-sm ${theme === 'dark' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setTheme('dark')}
                style={{ padding: '6px 14px' }}
              >
                <Moon size={14} />
                Dark Mode
              </button>
              <button
                type="button"
                className={`btn btn-sm ${theme === 'light' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setTheme('light')}
                style={{ padding: '6px 14px' }}
              >
                <Sun size={14} />
                Light Mode
              </button>
            </div>
          </div>

          {/* ── 1. Featured Luxury Palettes ── */}
          <div style={{ marginBottom: 26 }}>
            <div style={{
              fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6
            }}>
              <Crown size={14} style={{ color: '#fca311' }} /> Featured Luxury & Designer Palettes
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {PALETTES.filter(p => p.category === 'featured').map(p => (
                <PaletteCard
                  key={p.id}
                  palette={p}
                  active={palette === p.id}
                  theme={theme}
                  onSelect={() => setPalette(p.id)}
                />
              ))}
            </div>
          </div>

          {/* ── 2. Cold Palettes ── */}
          <div style={{ marginBottom: 26 }}>
            <div style={{
              fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6
            }}>
              <Snowflake size={13} style={{ color: '#38bdf8' }} /> Cold Color Palettes
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {PALETTES.filter(p => p.category === 'cold').map(p => (
                <PaletteCard
                  key={p.id}
                  palette={p}
                  active={palette === p.id}
                  theme={theme}
                  onSelect={() => setPalette(p.id)}
                />
              ))}
            </div>
          </div>

          {/* ── 3. Warm Palettes ── */}
          <div style={{ marginBottom: 26 }}>
            <div style={{
              fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6
            }}>
              <Flame size={13} style={{ color: '#f43f5e' }} /> Warm Color Palettes
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {PALETTES.filter(p => p.category === 'warm').map(p => (
                <PaletteCard
                  key={p.id}
                  palette={p}
                  active={palette === p.id}
                  theme={theme}
                  onSelect={() => setPalette(p.id)}
                />
              ))}
            </div>
          </div>

          {/* ── 4. Classic & Cyberpunk ── */}
          <div>
            <div style={{
              fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6
            }}>
              <Zap size={13} style={{ color: '#ff6b00' }} /> Classic &amp; Cyberpunk Palettes
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {PALETTES.filter(p => p.category === 'classic').map(p => (
                <PaletteCard
                  key={p.id}
                  palette={p}
                  active={palette === p.id}
                  theme={theme}
                  onSelect={() => setPalette(p.id)}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ─── 2. User Profile & GitHub Integration ───────────────────────── */}
        <section className="glass-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-md)',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-accent)'
            }}>
              <UserIcon size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>Account & Integrations</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Manage your user profile and GitHub connection</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* User Profile Info */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: 16, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)'
            }}>
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name || user.email}
                  style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid var(--accent-1)' }}
                />
              ) : (
                <div className="avatar" style={{ width: 48, height: 48, fontSize: 18 }}>
                  {initial}
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{user?.name || 'User'}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{user?.email}</div>
              </div>
            </div>

            {/* GitHub Integration Item */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: 20, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-overlay)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: user?.hasGithubToken ? 'var(--success)' : 'var(--text-secondary)'
                }}>
                  <Github size={22} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    GitHub Account & Security
                    {user?.hasGithubToken ? (
                      <span className="badge badge-ready">Connected & Stored in DB</span>
                    ) : (
                      <span className="badge badge-error">Not Connected</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {user?.hasGithubToken
                      ? 'Securely linked to your account. Persists across logout & future logins.'
                      : 'Connect your GitHub account via Popup to clone private repos'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {user?.hasGithubToken && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={handleDisconnectGithub}
                    disabled={connecting}
                  >
                    Disconnect
                  </button>
                )}
                <button
                  type="button"
                  className={`btn ${user?.hasGithubToken ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={handleConnectGithub}
                  disabled={connecting}
                >
                  {connecting ? <span className="spinner" /> : <Github size={14} />}
                  {connecting ? 'Connecting...' : user?.hasGithubToken ? 'Reconnect' : 'Connect via Popup'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ─── 3. Cloud Workspace Storage & Infrastructure ────────────────── */}
        <section className="glass-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-md)',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-accent)'
            }}>
              <HardDrive size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>Workspace Storage & Cloud Sync</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Permanent persistence via rclone bisync & S3 Cellar</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div style={{ padding: 16, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>LOCAL PATH</div>
              <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>/workspaces</div>
            </div>
            <div style={{ padding: 16, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>OBJECT STORAGE</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Clever Cloud Cellar (S3)</div>
            </div>
            <div style={{ padding: 16, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>SYNC ENGINE</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="status-dot ready" /> rclone bisync
              </div>
            </div>
          </div>
        </section>

        {/* ─── 4. Session & Security ──────────────────────────────────────── */}
        <section className="glass-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 'var(--radius-md)',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--danger)'
              }}>
                <Shield size={20} />
              </div>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700 }}>Session Control</h2>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Sign out of your account on this browser session</p>
              </div>
            </div>
            <button className="btn btn-danger" onClick={logout}>
              Sign Out
            </button>
          </div>
        </section>

        {/* ─── 5. Hermes AI Agent ──────────────────────────────────── */}
        <motion.section
          whileHover={{ y: -2 }}
          className="glass-card"
          style={{ padding: 28, cursor: 'pointer', background: 'linear-gradient(135deg, rgba(124,58,237,0.07), rgba(6,182,212,0.04))' }}
          onClick={() => navigate('/settings/hermes')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(6,182,212,0.15))',
                border: '1px solid rgba(124,58,237,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Bot size={24} style={{ color: 'var(--text-accent)' }} />
              </div>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  Hermes AI Agent
                  <span style={{ fontSize: 10, padding: '2px 7px', background: 'rgba(124,58,237,0.15)', borderRadius: 12, color: 'var(--text-accent)', fontWeight: 700, letterSpacing: '0.05em' }}>NEW</span>
                </h2>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Configure LLM provider, sandbox, memory, tools &amp; S3 archiving</p>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              Configure →
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  );
}

function PaletteCard({
  palette,
  active,
  theme,
  onSelect,
}: {
  palette: PaletteOption;
  active: boolean;
  theme: 'dark' | 'light';
  onSelect: () => void;
}) {
  const Icon = palette.icon;
  const colors = theme === 'dark' ? palette.colorsDark : palette.colorsLight;
  const accentColor = colors[1];

  return (
    <motion.div
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      style={{
        padding: 16,
        borderRadius: 'var(--radius-lg)',
        background: theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
        border: active ? `2px solid ${accentColor}` : '1px solid var(--border)',
        cursor: 'pointer',
        position: 'relative',
        boxShadow: active ? `0 0 20px ${accentColor}33` : 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
          <span style={{
            width: 28, height: 28, borderRadius: 'var(--radius-sm)',
            background: `${accentColor}20`, color: accentColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Icon size={16} />
          </span>
          <span>{palette.name}</span>
        </div>
        {active && (
          <span style={{
            width: 20, height: 20, borderRadius: '50%', background: accentColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
          }}>
            <Check size={13} />
          </span>
        )}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.4 }}>
        {palette.description}
      </p>

      {/* Swatch Preview Chips */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {colors.map((c, i) => (
          <div
            key={i}
            style={{
              flex: i === 0 ? 2 : 1,
              height: 18,
              borderRadius: 4,
              background: c,
              border: '1px solid rgba(0,0,0,0.1)',
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}

function ThemeStyleCard({
  styleOption,
  active,
  theme,
  onSelect,
}: {
  styleOption: ThemeStyleOption;
  active: boolean;
  theme: 'dark' | 'light';
  onSelect: () => void;
}) {
  const Icon = styleOption.icon;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      style={{
        padding: 16,
        borderRadius: styleOption.cardRadius === '2px' ? '4px' : styleOption.cardRadius === '24px' ? '18px' : '12px',
        background: theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
        border: active ? '2px solid var(--accent-1)' : '1px solid var(--border)',
        cursor: 'pointer',
        position: 'relative',
        boxShadow: active ? '0 0 24px rgba(124,58,237,0.25)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'all 0.2s ease',
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 32, height: 32, borderRadius: 'var(--radius-sm)',
              background: 'rgba(124,58,237,0.15)', color: 'var(--text-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <Icon size={18} />
            </span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{styleOption.name}</span>
                {styleOption.badge && (
                  <span style={{
                    fontSize: 9, padding: '1px 6px', borderRadius: 9999,
                    background: 'var(--accent-1)', color: '#fff', fontWeight: 700,
                  }}>
                    {styleOption.badge}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{styleOption.tagline}</span>
            </div>
          </div>
          {active && (
            <span style={{
              width: 20, height: 20, borderRadius: '50%', background: 'var(--accent-1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0
            }}>
              <Check size={13} />
            </span>
          )}
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.45 }}>
          {styleOption.description}
        </p>
      </div>

      {/* Live Interactive Shape Preview Box */}
      <div style={{
        padding: 10,
        borderRadius: styleOption.cardRadius,
        background: theme === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.7)',
        border: styleOption.id === 'neo_brutalism' ? '2px solid var(--text-primary)' : '1px solid var(--border)',
        boxShadow: styleOption.id === 'neo_brutalism' ? '2px 2px 0px var(--text-primary)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{
            flex: 1, padding: '4px 8px', fontSize: 11,
            borderRadius: styleOption.inputRadius === 'Pill (9999px)' ? '9999px' : styleOption.inputRadius,
            background: 'var(--bg-elevated)',
            border: styleOption.id === 'neo_brutalism' ? '1.5px solid var(--text-primary)' : '1px solid var(--border)',
            color: 'var(--text-muted)',
          }}>
            Sample Input
          </div>
          <button
            type="button"
            style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 600,
              borderRadius: styleOption.btnRadius === 'Pill (9999px)' ? '9999px' : styleOption.btnRadius,
              background: 'var(--accent-grad)',
              color: '#fff', border: styleOption.id === 'neo_brutalism' ? '1.5px solid var(--text-primary)' : 'none',
              cursor: 'pointer',
            }}
          >
            Button
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
          <span>Card: <strong>{styleOption.cardRadius}</strong></span>
          <span>Btn: <strong>{styleOption.btnRadius}</strong></span>
          <span>Badge: <strong>{styleOption.badgeRadius}</strong></span>
        </div>
      </div>
    </motion.div>
  );
}
