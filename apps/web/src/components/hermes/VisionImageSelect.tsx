import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  RiSearchLine,
  RiCheckLine,
  RiCloseLine,
  RiEyeLine,
  RiImageEditLine,
  RiCpuLine,
  RiFileCopyLine,
  RiArrowDownSLine,
  RiSparklingLine,
  RiEdit2Line,
  RiRefreshLine,
  RiFilter3Line,
} from 'react-icons/ri';
import type { SatDiscoveredModel } from '../../api/client';

export interface VisionImageSelectOption {
  id: string;
  name?: string;
  description?: string;
  contextLength?: number;
  isVision?: boolean;
  isImageGen?: boolean;
  raw?: any;
}

interface VisionImageSelectProps {
  value: string;
  onChange: (modelId: string, item?: VisionImageSelectOption) => void;
  models: VisionImageSelectOption[];
  placeholder?: string;
  mode?: 'vision' | 'image' | 'all';
  disabled?: boolean;
  loading?: boolean;
  onDiscover?: () => void;
}

const ITEM_HEIGHT = 48; // Exact row height in px for true virtualization
const VIEWPORT_HEIGHT = 320; // Height of scroll container
const OVERSCAN = 4; // Extra rows to render above and below viewport for silky-smooth scroll

export const VisionImageSelect: React.FC<VisionImageSelectProps> = ({
  value,
  onChange,
  models = [],
  placeholder = 'Select a model...',
  mode = 'all',
  disabled = false,
  loading = false,
  onDiscover,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCap, setFilterCap] = useState<'all' | 'vision' | 'image'>(() => {
    if (mode === 'vision') return 'vision';
    if (mode === 'image') return 'image';
    return 'all';
  });
  const [selectedVendor, setSelectedVendor] = useState<string>('all');
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState(value || '');
  const [copied, setCopied] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sync custom input with current value
  useEffect(() => {
    setCustomInput(value || '');
  }, [value]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
      setCustomMode(false);
      setScrollTop(0);
    }
  }, [isOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Extract top vendors/prefixes dynamically
  const vendorList = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of models) {
      if (m.id.includes('/')) {
        const prefix = m.id.split('/')[0];
        counts[prefix] = (counts[prefix] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([name, count]) => ({ name, count }));
  }, [models]);

  // Capability count metadata
  const metaCounts = useMemo(() => {
    let vision = 0;
    let image = 0;
    for (const m of models) {
      if (m.isVision) vision++;
      if (m.isImageGen) image++;
    }
    return { total: models.length, vision, image };
  }, [models]);

  // Ultra-fast memoized filter: handles 10,000+ items with sub-millisecond search
  const filteredModels = useMemo(() => {
    let list = models;

    // 1. Capability filter
    if (filterCap === 'vision') {
      list = list.filter((m) => m.isVision);
    } else if (filterCap === 'image') {
      list = list.filter((m) => m.isImageGen);
    }

    // 2. Vendor filter
    if (selectedVendor !== 'all') {
      const vPrefix = `${selectedVendor}/`;
      list = list.filter((m) => m.id.startsWith(vPrefix) || m.id.includes(selectedVendor));
    }

    // 3. Text query search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (m) =>
          m.id.toLowerCase().includes(q) ||
          (m.name && m.name.toLowerCase().includes(q)) ||
          (m.description && m.description.toLowerCase().includes(q))
      );
    }

    return list;
  }, [models, filterCap, selectedVendor, searchQuery]);

  // Virtualization Calculations
  const totalCount = filteredModels.length;
  const totalHeight = totalCount * ITEM_HEIGHT;

  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    totalCount,
    Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ITEM_HEIGHT) + OVERSCAN
  );

  const visibleItems = useMemo(() => {
    return filteredModels.slice(startIndex, endIndex).map((item, idx) => ({
      item,
      index: startIndex + idx,
      top: (startIndex + idx) * ITEM_HEIGHT,
    }));
  }, [filteredModels, startIndex, endIndex]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const handleSelect = (item: VisionImageSelectOption) => {
    onChange(item.id, item);
    setIsOpen(false);
  };

  const handleApplyCustom = (customVal?: string) => {
    const toApply = customVal !== undefined ? customVal : customInput;
    if (toApply.trim()) {
      const existing = models.find((m) => m.id.toLowerCase() === toApply.trim().toLowerCase());
      onChange(toApply.trim(), existing);
      setIsOpen(false);
    }
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Find active model details
  const activeModelMeta = useMemo(() => {
    return models.find((m) => m.id === value);
  }, [models, value]);

  const isVisionActive = activeModelMeta?.isVision || mode === 'vision';
  const isImageActive = activeModelMeta?.isImageGen || mode === 'image';

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* ── Main Select Trigger Control ─────────────────────────────── */}
      <div
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          background: 'var(--bg-elevated)',
          border: `1px solid ${isOpen ? 'var(--primary)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-md)',
          padding: '8px 12px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxShadow: isOpen ? '0 0 0 2px var(--primary-dim, rgba(124,58,237,0.25))' : 'none',
          transition: 'all 0.15s ease',
          opacity: disabled ? 0.6 : 1,
          minHeight: 44,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          {/* Icon Badge */}
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 'var(--radius-sm)',
              background: mode === 'vision'
                ? 'rgba(16, 185, 129, 0.12)'
                : mode === 'image'
                ? 'rgba(124, 58, 237, 0.12)'
                : 'rgba(59, 130, 246, 0.12)',
              color: mode === 'vision'
                ? 'var(--success, #10b981)'
                : mode === 'image'
                ? 'var(--primary, #7c3aed)'
                : 'var(--info, #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {mode === 'vision' || activeModelMeta?.isVision ? (
              <RiEyeLine size={16} />
            ) : mode === 'image' || activeModelMeta?.isImageGen ? (
              <RiImageEditLine size={16} />
            ) : (
              <RiCpuLine size={16} />
            )}
          </div>

          {/* Model Display */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
            {value ? (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={value}
              >
                {value}
              </span>
            ) : (
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {placeholder}
              </span>
            )}

            {/* Badges on Trigger */}
            {activeModelMeta?.isVision && (
              <span
                style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: 'var(--success, #10b981)',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <RiEyeLine size={11} /> Vision
              </span>
            )}

            {activeModelMeta?.isImageGen && (
              <span
                style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(124, 58, 237, 0.15)',
                  color: 'var(--primary, #7c3aed)',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <RiSparklingLine size={11} /> Image Gen
              </span>
            )}

            {activeModelMeta?.contextLength && (
              <span
                style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                {Math.round(activeModelMeta.contextLength / 1000)}k ctx
              </span>
            )}
          </div>
        </div>

        {/* Trigger Action Icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {value && (
            <button
              type="button"
              onClick={handleCopy}
              title="Copy Model Identifier"
              style={{
                background: 'transparent',
                border: 'none',
                color: copied ? 'var(--success, #10b981)' : 'var(--text-secondary)',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                borderRadius: 4,
              }}
            >
              {copied ? <RiCheckLine size={15} /> : <RiFileCopyLine size={15} />}
            </button>
          )}

          <div
            style={{
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s ease',
            }}
          >
            <RiArrowDownSLine size={18} />
          </div>
        </div>
      </div>

      {/* ── Rich Virtualized Dropdown Popover ───────────────────────── */}
      {isOpen && (
        <div
          className="glass-card"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 150,
            padding: 14,
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 18px 45px rgba(0,0,0,0.5)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            backdropFilter: 'blur(24px)',
          }}
        >
          {/* 1. Header Search & Custom Input Bar */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '6px 12px',
              }}
            >
              <RiSearchLine size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${models.length > 0 ? models.length.toLocaleString() : ''} models by name, vendor, type...`}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  width: '100%',
                }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filteredModels.length > 0) {
                    handleSelect(filteredModels[0]);
                  } else if (e.key === 'Escape') {
                    setIsOpen(false);
                  }
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: 2,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <RiCloseLine size={16} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setCustomMode((prev) => !prev)}
              className={`btn ${customMode ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: 11, padding: '6px 10px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <RiEdit2Line size={13} /> Custom ID
            </button>
          </div>

          {/* Custom ID Input Row */}
          {customMode && (
            <div
              style={{
                padding: 8,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-card)',
                border: '1px dashed var(--primary)',
                display: 'flex',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Enter custom model identifier (e.g. fal-ai/flux-pro, qwen/qwen-2.5-vl)"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  padding: '5px 8px',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleApplyCustom();
                }}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleApplyCustom()}
                style={{ padding: '5px 12px', fontSize: 11 }}
              >
                Apply
              </button>
            </div>
          )}

          {/* 2. Capability Filters & Vendor Pills */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setFilterCap('all')}
                style={{
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: filterCap === 'all' ? 'var(--primary)' : 'var(--bg-card)',
                  color: filterCap === 'all' ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                All Models ({metaCounts.total.toLocaleString()})
              </button>

              <button
                type="button"
                onClick={() => setFilterCap('vision')}
                style={{
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: filterCap === 'vision' ? 'var(--success, #10b981)' : 'var(--bg-card)',
                  color: filterCap === 'vision' ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <RiEyeLine size={12} /> Multimodal Vision ({metaCounts.vision.toLocaleString()})
              </button>

              <button
                type="button"
                onClick={() => setFilterCap('image')}
                style={{
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: filterCap === 'image' ? 'var(--primary, #7c3aed)' : 'var(--bg-card)',
                  color: filterCap === 'image' ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <RiImageEditLine size={12} /> Image Generation ({metaCounts.image.toLocaleString()})
              </button>

              {onDiscover && (
                <button
                  type="button"
                  onClick={onDiscover}
                  disabled={loading}
                  title="Discover models from endpoint"
                  style={{
                    marginLeft: 'auto',
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 10,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <RiRefreshLine className={loading ? 'spin' : ''} size={12} />
                  {loading ? 'Discovering...' : 'Discover'}
                </button>
              )}
            </div>

            {/* Vendor Quick Chips */}
            {vendorList.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Vendors:</span>
                <button
                  type="button"
                  onClick={() => setSelectedVendor('all')}
                  style={{
                    padding: '1px 6px',
                    fontSize: 10,
                    borderRadius: 4,
                    background: selectedVendor === 'all' ? 'var(--primary-dim, rgba(124,58,237,0.2))' : 'transparent',
                    color: selectedVendor === 'all' ? 'var(--primary)' : 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  All
                </button>
                {vendorList.map((v) => (
                  <button
                    key={v.name}
                    type="button"
                    onClick={() => setSelectedVendor(selectedVendor === v.name ? 'all' : v.name)}
                    style={{
                      padding: '1px 6px',
                      fontSize: 10,
                      borderRadius: 4,
                      background: selectedVendor === v.name ? 'var(--primary-dim, rgba(124,58,237,0.2))' : 'transparent',
                      color: selectedVendor === v.name ? 'var(--primary)' : 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    {v.name} ({v.count})
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 3. True Virtualized High-Performance List */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            style={{
              position: 'relative',
              height: VIEWPORT_HEIGHT,
              overflowY: 'auto',
              borderTop: '1px solid var(--border)',
              borderBottom: '1px solid var(--border)',
              paddingRight: 4,
            }}
          >
            {loading ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                <RiRefreshLine className="spin" size={24} style={{ margin: '0 auto 8px', display: 'block', color: 'var(--primary)' }} />
                Fetching model catalog...
              </div>
            ) : totalCount === 0 ? (
              <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                <p style={{ margin: '0 0 10px 0' }}>No models matching &quot;{searchQuery}&quot;</p>
                {searchQuery.trim() && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleApplyCustom(searchQuery.trim())}
                    style={{ fontSize: 11, padding: '4px 12px' }}
                  >
                    Use &quot;{searchQuery.trim()}&quot; as Custom Model ID
                  </button>
                )}
              </div>
            ) : (
              <div style={{ height: totalHeight, position: 'relative', width: '100%' }}>
                {visibleItems.map(({ item, index, top }) => {
                  const isSelected = item.id === value;
                  const parts = item.id.includes('/') ? item.id.split('/') : [null, item.id];
                  const vendor = parts[0];
                  const name = parts[1] || parts[0];

                  return (
                    <div
                      key={item.id || index}
                      onClick={() => handleSelect(item)}
                      style={{
                        position: 'absolute',
                        top: top,
                        left: 0,
                        right: 0,
                        height: ITEM_HEIGHT - 4,
                        padding: '0 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: isSelected
                          ? 'var(--primary-dim, rgba(124,58,237,0.16))'
                          : 'transparent',
                        border: `1px solid ${isSelected ? 'var(--primary)' : 'transparent'}`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        transition: 'background 0.1s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'var(--bg-card)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {/* Left: Model Name & Vendor */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', minWidth: 0 }}>
                        <div
                          style={{
                            color: isSelected
                              ? 'var(--primary)'
                              : item.isVision
                              ? 'var(--success, #10b981)'
                              : item.isImageGen
                              ? 'var(--primary, #7c3aed)'
                              : 'var(--text-muted)',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          {item.isVision ? (
                            <RiEyeLine size={15} />
                          ) : item.isImageGen ? (
                            <RiImageEditLine size={15} />
                          ) : (
                            <RiCpuLine size={15} />
                          )}
                        </div>

                        <div style={{ overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {vendor && (
                            <span
                              style={{
                                fontSize: 11,
                                color: 'var(--text-muted)',
                                fontFamily: 'var(--font-mono)',
                                flexShrink: 0,
                              }}
                            >
                              {vendor}/
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: isSelected ? 700 : 500,
                              color: isSelected ? 'var(--primary)' : 'var(--text-primary)',
                              fontFamily: 'var(--font-mono)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {name}
                          </span>
                        </div>
                      </div>

                      {/* Right: Badges & Checkmark */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {item.isVision && (
                          <span
                            style={{
                              fontSize: 9,
                              padding: '1px 5px',
                              borderRadius: 4,
                              background: 'rgba(16, 185, 129, 0.12)',
                              color: 'var(--success, #10b981)',
                              fontWeight: 600,
                            }}
                          >
                            Vision
                          </span>
                        )}

                        {item.isImageGen && (
                          <span
                            style={{
                              fontSize: 9,
                              padding: '1px 5px',
                              borderRadius: 4,
                              background: 'rgba(124, 58, 237, 0.12)',
                              color: 'var(--primary, #7c3aed)',
                              fontWeight: 600,
                            }}
                          >
                            Image Gen
                          </span>
                        )}

                        {item.contextLength && (
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {Math.round(item.contextLength / 1000)}k
                          </span>
                        )}

                        {isSelected && (
                          <RiCheckLine size={16} style={{ color: 'var(--primary)', marginLeft: 2 }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 4. Dropdown Footer Status */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 11,
              color: 'var(--text-secondary)',
              paddingTop: 2,
            }}
          >
            <span>
              Showing {filteredModels.length.toLocaleString()} matching of {models.length.toLocaleString()} models
            </span>
            <span>Click row to select</span>
          </div>
        </div>
      )}
    </div>
  );
};
