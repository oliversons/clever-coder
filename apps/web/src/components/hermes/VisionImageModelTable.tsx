import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  RiSearchLine,
  RiCheckLine,
  RiCloseLine,
  RiEyeLine,
  RiImageEditLine,
  RiCpuLine,
  RiFileCopyLine,
  RiSparklingLine,
  RiRefreshLine,
  RiSortAsc,
  RiSortDesc,
  RiDatabase2Line,
  RiArrowRightLine,
  RiFullscreenLine,
  RiFullscreenExitLine,
} from 'react-icons/ri';
import type { SatDiscoveredModel } from '../../api/client';

interface VisionImageModelTableProps {
  models: SatDiscoveredModel[];
  baseUrl?: string;
  defaultVisionModel?: string;
  defaultImageGenModel?: string;
  onSetVisionDefault: (modelId: string) => void;
  onSetImageGenDefault: (modelId: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const ROW_HEIGHT = 52; // Row height in px for virtualized table
const DEFAULT_HEIGHT = 480;

export const VisionImageModelTable: React.FC<VisionImageModelTableProps> = ({
  models = [],
  baseUrl,
  defaultVisionModel,
  defaultImageGenModel,
  onSetVisionDefault,
  onSetImageGenDefault,
  onRefresh,
  isRefreshing = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [capabilityFilter, setCapabilityFilter] = useState<'all' | 'vision' | 'image' | 'llm'>('all');
  const [selectedVendor, setSelectedVendor] = useState<string>('all');
  const [sortField, setSortField] = useState<'id' | 'capability' | 'context'>('id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [tableHeight, setTableHeight] = useState<number>(DEFAULT_HEIGHT);
  const [scrollTop, setScrollTop] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Dynamic Vendor extraction & counts
  const { vendorList, counts } = useMemo(() => {
    let vision = 0;
    let image = 0;
    let llm = 0;
    const vendors: Record<string, number> = {};

    for (const m of models) {
      if (m.isVision) vision++;
      if (m.isImageGen) image++;
      if (!m.isVision && !m.isImageGen) llm++;

      if (m.id.includes('/')) {
        const prefix = m.id.split('/')[0];
        vendors[prefix] = (vendors[prefix] || 0) + 1;
      }
    }

    const sortedVendors = Object.entries(vendors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, count]) => ({ name, count }));

    return {
      vendorList: sortedVendors,
      counts: {
        total: models.length,
        vision,
        image,
        llm,
      },
    };
  }, [models]);

  // Fast filtered & sorted list
  const filteredModels = useMemo(() => {
    let list = models;

    // 1. Capability filter
    if (capabilityFilter === 'vision') {
      list = list.filter((m) => m.isVision);
    } else if (capabilityFilter === 'image') {
      list = list.filter((m) => m.isImageGen);
    } else if (capabilityFilter === 'llm') {
      list = list.filter((m) => !m.isVision && !m.isImageGen);
    }

    // 2. Vendor filter
    if (selectedVendor !== 'all') {
      const vPrefix = `${selectedVendor}/`;
      list = list.filter((m) => m.id.startsWith(vPrefix) || m.id.includes(selectedVendor));
    }

    // 3. Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (m) =>
          m.id.toLowerCase().includes(q) ||
          (m.name && m.name.toLowerCase().includes(q)) ||
          (m.description && m.description.toLowerCase().includes(q))
      );
    }

    // 4. Sorting
    list = [...list].sort((a, b) => {
      if (sortField === 'id') {
        return sortOrder === 'asc' ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
      } else if (sortField === 'capability') {
        const capScoreA = (a.isVision ? 2 : 0) + (a.isImageGen ? 4 : 0);
        const capScoreB = (b.isVision ? 2 : 0) + (b.isImageGen ? 4 : 0);
        return sortOrder === 'asc' ? capScoreA - capScoreB : capScoreB - capScoreA;
      } else if (sortField === 'context') {
        const ctxA = a.contextLength || 0;
        const ctxB = b.contextLength || 0;
        return sortOrder === 'asc' ? ctxA - ctxB : ctxB - ctxA;
      }
      return 0;
    });

    return list;
  }, [models, capabilityFilter, selectedVendor, searchQuery, sortField, sortOrder]);

  // Virtualization Calculations
  const totalCount = filteredModels.length;
  const totalHeight = totalCount * ROW_HEIGHT;
  const overscan = 6;

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - overscan);
  const endIndex = Math.min(
    totalCount,
    Math.ceil((scrollTop + tableHeight) / ROW_HEIGHT) + overscan
  );

  const visibleRows = useMemo(() => {
    return filteredModels.slice(startIndex, endIndex).map((item, idx) => ({
      item,
      index: startIndex + idx,
      top: (startIndex + idx) * ROW_HEIGHT,
    }));
  }, [filteredModels, startIndex, endIndex]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const handleCopy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const toggleSort = (field: 'id' | 'capability' | 'context') => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  return (
    <div
      ref={containerRef}
      className="glass-card"
      style={{
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 12px 36px rgba(0,0,0,0.3)',
      }}
    >
      {/* ── 1. Giant Card Header ───────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 14,
          paddingBottom: 16,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary-dim, rgba(124,58,237,0.15))',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border-accent, rgba(124,58,237,0.3))',
            }}
          >
            <RiDatabase2Line size={24} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Discovered Model Catalog
              </h3>
              <span
                className="badge badge-success"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  padding: '2px 8px',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--success, #10b981)',
                    display: 'inline-block',
                  }}
                />
                Live Connection Active
              </span>
            </div>

            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '3px 0 0 0' }}>
              Discovered <strong style={{ color: 'var(--text-accent)' }}>{models.length.toLocaleString()}</strong> models
              {baseUrl ? ` from ${baseUrl}` : ''} • Ultra-fast virtualized data grid with instant search
            </p>
          </div>
        </div>

        {/* Header Action Tools */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setTableHeight((prev) => (prev === DEFAULT_HEIGHT ? 680 : DEFAULT_HEIGHT))}
            style={{ fontSize: 11, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
            title={tableHeight === DEFAULT_HEIGHT ? 'Expand table view' : 'Collapse table view'}
          >
            {tableHeight === DEFAULT_HEIGHT ? <RiFullscreenLine size={14} /> : <RiFullscreenExitLine size={14} />}
            {tableHeight === DEFAULT_HEIGHT ? 'Expand View' : 'Compact View'}
          </button>

          {onRefresh && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onRefresh}
              disabled={isRefreshing}
              style={{ fontSize: 11, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <RiRefreshLine className={isRefreshing ? 'spin' : ''} size={14} />
              {isRefreshing ? 'Discovering...' : 'Re-Discover'}
            </button>
          )}
        </div>
      </div>

      {/* ── 2. Real-Time Search & Capability Filters ───────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search Input */}
          <div
            style={{
              flex: '1 1 320px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 14px',
              minWidth: 260,
            }}
          >
            <RiSearchLine size={17} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${models.length.toLocaleString()} models by ID, name, vendor (e.g. flux, glm, 4o, claude, qwen)...`}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: 13,
                width: '100%',
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

          {/* Quick Clear Filter if active */}
          {(searchQuery || capabilityFilter !== 'all' || selectedVendor !== 'all') && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSearchQuery('');
                setCapabilityFilter('all');
                setSelectedVendor('all');
              }}
              style={{ fontSize: 11, padding: '7px 12px', whiteSpace: 'nowrap' }}
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Capability Filter Tabs */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setCapabilityFilter('all')}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              background: capabilityFilter === 'all' ? 'var(--primary)' : 'var(--bg-elevated)',
              color: capabilityFilter === 'all' ? '#fff' : 'var(--text-secondary)',
              border: '1px solid var(--border)',
              transition: 'all 0.15s ease',
            }}
          >
            All Models ({counts.total.toLocaleString()})
          </button>

          <button
            type="button"
            onClick={() => setCapabilityFilter('vision')}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              background: capabilityFilter === 'vision' ? 'var(--success, #10b981)' : 'var(--bg-elevated)',
              color: capabilityFilter === 'vision' ? '#fff' : 'var(--text-secondary)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            <RiEyeLine size={14} /> Multimodal Vision ({counts.vision.toLocaleString()})
          </button>

          <button
            type="button"
            onClick={() => setCapabilityFilter('image')}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              background: capabilityFilter === 'image' ? 'var(--primary, #7c3aed)' : 'var(--bg-elevated)',
              color: capabilityFilter === 'image' ? '#fff' : 'var(--text-secondary)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            <RiImageEditLine size={14} /> Image Generation ({counts.image.toLocaleString()})
          </button>

          <button
            type="button"
            onClick={() => setCapabilityFilter('llm')}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              background: capabilityFilter === 'llm' ? 'var(--info, #3b82f6)' : 'var(--bg-elevated)',
              color: capabilityFilter === 'llm' ? '#fff' : 'var(--text-secondary)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            <RiCpuLine size={14} /> Text &amp; Reasoning ({counts.llm.toLocaleString()})
          </button>
        </div>

        {/* Vendor Filter Chips */}
        {vendorList.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>Vendors:</span>
            <button
              type="button"
              onClick={() => setSelectedVendor('all')}
              style={{
                padding: '2px 8px',
                fontSize: 11,
                borderRadius: 'var(--radius-sm)',
                background: selectedVendor === 'all' ? 'var(--primary-dim, rgba(124,58,237,0.25))' : 'var(--bg-elevated)',
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
                  padding: '2px 8px',
                  fontSize: 11,
                  borderRadius: 'var(--radius-sm)',
                  background: selectedVendor === v.name ? 'var(--primary-dim, rgba(124,58,237,0.25))' : 'var(--bg-elevated)',
                  color: selectedVendor === v.name ? 'var(--primary)' : 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {v.name} <span style={{ opacity: 0.7, fontSize: 10 }}>({v.count})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 3. High-Performance Virtualized Table ──────────────────────── */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          background: 'var(--bg-card)',
        }}
      >
        {/* Sticky Table Header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '60px 1fr 220px 130px 280px',
            padding: '10px 16px',
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border)',
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--text-secondary)',
            alignItems: 'center',
            userSelect: 'none',
          }}
        >
          <div>#</div>

          <div
            onClick={() => toggleSort('id')}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span>Model Identifier &amp; Vendor</span>
            {sortField === 'id' && (sortOrder === 'asc' ? <RiSortAsc size={15} /> : <RiSortDesc size={15} />)}
          </div>

          <div
            onClick={() => toggleSort('capability')}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span>Capabilities</span>
            {sortField === 'capability' && (sortOrder === 'asc' ? <RiSortAsc size={15} /> : <RiSortDesc size={15} />)}
          </div>

          <div
            onClick={() => toggleSort('context')}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span>Context / Specs</span>
            {sortField === 'context' && (sortOrder === 'asc' ? <RiSortAsc size={15} /> : <RiSortDesc size={15} />)}
          </div>

          <div style={{ textAlign: 'right' }}>Default Assignment &amp; Actions</div>
        </div>

        {/* Scrollable Virtualized Body Container */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{
            height: tableHeight,
            overflowY: 'auto',
            position: 'relative',
          }}
        >
          {totalCount === 0 ? (
            <div
              style={{
                padding: 48,
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: 14,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <RiSearchLine size={32} style={{ color: 'var(--text-muted)' }} />
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>No models matched your search or filters</strong>
                <p style={{ fontSize: 12, margin: '4px 0 0 0', color: 'var(--text-secondary)' }}>
                  Try changing your search query or reset capability and vendor filters.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setSearchQuery('');
                  setCapabilityFilter('all');
                  setSelectedVendor('all');
                }}
                style={{ fontSize: 12 }}
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            <div style={{ height: totalHeight, position: 'relative', width: '100%' }}>
              {visibleRows.map(({ item, index, top }) => {
                const isVisionDefault = defaultVisionModel === item.id;
                const isImageGenDefault = defaultImageGenModel === item.id;

                const parts = item.id.includes('/') ? item.id.split('/') : [null, item.id];
                const vendor = parts[0];
                const modelName = parts[1] || parts[0];

                return (
                  <div
                    key={item.id}
                    style={{
                      position: 'absolute',
                      top: top,
                      left: 0,
                      right: 0,
                      height: ROW_HEIGHT,
                      display: 'grid',
                      gridTemplateColumns: '60px 1fr 220px 130px 280px',
                      padding: '0 16px',
                      alignItems: 'center',
                      borderBottom: '1px solid var(--border)',
                      background: isVisionDefault || isImageGenDefault
                        ? 'var(--primary-dim, rgba(124,58,237,0.08))'
                        : index % 2 === 0
                        ? 'transparent'
                        : 'rgba(255, 255, 255, 0.015)',
                      transition: 'background 0.1s ease',
                      fontSize: 13,
                    }}
                    onMouseEnter={(e) => {
                      if (!isVisionDefault && !isImageGenDefault) {
                        e.currentTarget.style.background = 'var(--bg-elevated)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isVisionDefault && !isImageGenDefault) {
                        e.currentTarget.style.background = index % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.015)';
                      }
                    }}
                  >
                    {/* Index */}
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                      #{index + 1}
                    </div>

                    {/* Model ID with Copy Tooltip */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', minWidth: 0, paddingRight: 10 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          overflow: 'hidden',
                          minWidth: 0,
                        }}
                      >
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
                            fontFamily: 'var(--font-mono)',
                            fontWeight: isVisionDefault || isImageGenDefault ? 700 : 600,
                            color: isVisionDefault
                              ? 'var(--success, #10b981)'
                              : isImageGenDefault
                              ? 'var(--primary, #7c3aed)'
                              : 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={item.id}
                        >
                          {modelName}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleCopy(item.id, e)}
                        title="Copy full model identifier"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: copiedId === item.id ? 'var(--success, #10b981)' : 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: 4,
                          display: 'flex',
                          alignItems: 'center',
                          borderRadius: 4,
                          flexShrink: 0,
                        }}
                      >
                        {copiedId === item.id ? <RiCheckLine size={14} /> : <RiFileCopyLine size={14} />}
                      </button>
                    </div>

                    {/* Capabilities Badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {item.isVision && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: '2px 7px',
                            borderRadius: 'var(--radius-full)',
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: 'var(--success, #10b981)',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          <RiEyeLine size={11} /> Vision Capable
                        </span>
                      )}

                      {item.isImageGen && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: '2px 7px',
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

                      {!item.isVision && !item.isImageGen && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: '2px 7px',
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--bg-elevated)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          Text / LLM
                        </span>
                      )}
                    </div>

                    {/* Context / Specs */}
                    <div style={{ color: 'var(--text-secondary)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                      {item.contextLength ? (
                        <span>{Math.round(item.contextLength / 1000)}k tokens</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Standard</span>
                      )}
                    </div>

                    {/* Quick Assignment Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                      {/* Vision Default Assignment */}
                      {isVisionDefault ? (
                        <span
                          style={{
                            fontSize: 11,
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'rgba(16, 185, 129, 0.2)',
                            color: 'var(--success, #10b981)',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            border: '1px solid rgba(16, 185, 129, 0.4)',
                          }}
                        >
                          <RiCheckLine size={13} /> Active Vision
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => onSetVisionDefault(item.id)}
                          style={{
                            fontSize: 11,
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-sm)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          title={`Assign ${item.id} as default vision model`}
                        >
                          <RiEyeLine size={12} /> Set Vision
                        </button>
                      )}

                      {/* Image Gen Default Assignment */}
                      {isImageGenDefault ? (
                        <span
                          style={{
                            fontSize: 11,
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'rgba(124, 58, 237, 0.2)',
                            color: 'var(--primary, #7c3aed)',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            border: '1px solid rgba(124, 58, 237, 0.4)',
                          }}
                        >
                          <RiCheckLine size={13} /> Active Image
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => onSetImageGenDefault(item.id)}
                          style={{
                            fontSize: 11,
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-sm)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          title={`Assign ${item.id} as default image generation model`}
                        >
                          <RiImageEditLine size={12} /> Set Image
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── 4. Table Footer Stats & Shortcuts ──────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          fontSize: 12,
          color: 'var(--text-secondary)',
          paddingTop: 4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span>
            Showing <strong style={{ color: 'var(--text-primary)' }}>{filteredModels.length.toLocaleString()}</strong> of{' '}
            <strong>{models.length.toLocaleString()}</strong> models
          </span>
          {searchQuery && (
            <span>
              Matching query &quot;<strong style={{ color: 'var(--text-accent)' }}>{searchQuery}</strong>&quot;
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Click &quot;Set Vision&quot; or &quot;Set Image&quot; to instantly assign default models
          </span>
        </div>
      </div>
    </div>
  );
};
