import { useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAtomsStore, SourceFilterType, SortField, SortOrder } from '../../stores/atoms';
import { useUIStore, ViewMode, AtomsLayout } from '../../stores/ui';

interface FilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  displayCount: number;
}

const SORT_OPTIONS: { field: SortField; order: SortOrder; labelKey: string }[] = [
  { field: 'updated', order: 'desc', labelKey: 'atoms_filter_updated_newest' },
  { field: 'updated', order: 'asc', labelKey: 'atoms_filter_updated_oldest' },
  { field: 'created', order: 'desc', labelKey: 'atoms_filter_created_newest' },
  { field: 'created', order: 'asc', labelKey: 'atoms_filter_created_oldest' },
  { field: 'published', order: 'desc', labelKey: 'atoms_filter_published_newest' },
  { field: 'published', order: 'asc', labelKey: 'atoms_filter_published_oldest' },
  { field: 'title', order: 'asc', labelKey: 'atoms_filter_title_az' },
  { field: 'title', order: 'desc', labelKey: 'atoms_filter_title_za' },
];

const VIEW_MODES: { id: ViewMode; labelKey: string }[] = [
  { id: 'dashboard', labelKey: 'atoms_view_dashboard' },
  { id: 'atoms', labelKey: 'atoms_view_atoms' },
  { id: 'canvas', labelKey: 'atoms_view_canvas' },
  { id: 'wiki', labelKey: 'atoms_view_wiki' },
];

const ATOM_LAYOUTS: { id: AtomsLayout; labelKey: string }[] = [
  { id: 'grid', labelKey: 'atoms_layout_grid' },
  { id: 'list', labelKey: 'atoms_layout_list' },
];

export function FilterSheet({ isOpen, onClose, displayCount }: FilterSheetProps) {
  const { t } = useTranslation();

  const viewMode = useUIStore(s => s.viewMode);
  const setViewMode = useUIStore(s => s.setViewMode);
  const atomsLayout = useUIStore(s => s.atomsLayout);
  const setAtomsLayout = useUIStore(s => s.setAtomsLayout);

  const sourceFilter = useAtomsStore(s => s.sourceFilter);
  const sourceValue = useAtomsStore(s => s.sourceValue);
  const sortBy = useAtomsStore(s => s.sortBy);
  const sortOrder = useAtomsStore(s => s.sortOrder);
  const availableSources = useAtomsStore(s => s.availableSources);
  const setSourceFilter = useAtomsStore(s => s.setSourceFilter);
  const setSourceValue = useAtomsStore(s => s.setSourceValue);
  const setSortBy = useAtomsStore(s => s.setSortBy);
  const setSortOrder = useAtomsStore(s => s.setSortOrder);
  const fetchSources = useAtomsStore(s => s.fetchSources);

  useEffect(() => {
    if (isOpen) fetchSources();
  }, [isOpen, fetchSources]);

  // Lock body scroll while the sheet is open
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [isOpen]);

  const handleSortChange = (field: SortField, order: SortOrder) => {
    setSortBy(field);
    setSortOrder(order);
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 bg-[var(--color-bg-panel)] border-t border-[var(--color-border)] rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col transition-transform duration-300 ease-out pb-[env(safe-area-inset-bottom)] ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={t('atoms_filter_and_sort_aria_label')}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-[var(--color-border)]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)] shrink-0">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              {t('atoms_filter_view_and_filter')}
            </h2>
            <p className="text-xs text-[var(--color-text-secondary)]">
              {displayCount} {displayCount !== 1 ? t('atoms_filter_count_plural', { count: displayCount }) : t('atoms_filter_count_singular')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
            aria-label={t('common_close')}
          >
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {/*
          // View mode - TEMPORARILY DISABLED (view switching now in titlebar)
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-2">
              View
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {VIEW_MODES.map(vm => (
                <button
                  key={vm.id}
                  onClick={() => setViewMode(vm.id)}
                  className={`py-2 px-3 rounded-md text-sm transition-colors border ${
                    viewMode === vm.id
                      ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                      : 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)] border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]'
                  }`}
                >
                  {t(vm.labelKey)}
                </button>
              ))}
            </div>

            {viewMode === 'atoms' && (
              <div className="mt-3">
                <h4 className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-2">
                  Layout
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {ATOM_LAYOUTS.map(l => (
                    <button
                      key={l.id}
                      onClick={() => setAtomsLayout(l.id)}
                      className={`py-2 px-3 rounded-md text-sm transition-colors border ${
                        atomsLayout === l.id
                          ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent-light)] border-[var(--color-accent)]/40'
                          : 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)] border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]'
                      }`}
                    >
                      {t(l.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
          */}

          {/* Source filter */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-2">
              {t('atoms_filter_source')}
            </h3>
            <div className="flex flex-wrap gap-2">
              {(['all', 'manual', 'external'] as SourceFilterType[]).map(f => (
                <button
                  key={f}
                  onClick={() => { setSourceFilter(f); if (f !== 'external') setSourceValue(null); }}
                  className={`py-1.5 px-3 rounded-full text-sm transition-colors border ${
                    sourceFilter === f && !sourceValue
                      ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent-light)] border-[var(--color-accent)]/40'
                      : 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)] border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]'
                  }`}
                >
                  {f === 'all' ? t('atoms_filter_source_all') : f === 'manual' ? t('atoms_filter_source_manual') : t('atoms_filter_source_external')}
                </button>
              ))}
            </div>

            {availableSources.length > 0 && (
              <div className="mt-3">
                <div className="text-xs text-[var(--color-text-tertiary)] mb-1.5">
                  {t('atoms_filter_source_specific')}
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                  {availableSources.map(s => (
                    <button
                      key={s.source}
                      onClick={() => setSourceValue(sourceValue === s.source ? null : s.source)}
                      className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        sourceValue === s.source
                          ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent-light)] border-[var(--color-accent)]/40'
                          : 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)] border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]'
                      }`}
                    >
                      <span className="truncate max-w-[140px]">{s.source}</span>
                      <span className="text-[var(--color-text-tertiary)]">{s.atom_count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Sort */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] mb-2">
              {t('atoms_filter_sort_by')}
            </h3>
            <div className="flex flex-col divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-md overflow-hidden bg-[var(--color-bg-card)]">
              {SORT_OPTIONS.map(opt => {
                const isActive = sortBy === opt.field && sortOrder === opt.order;
                return (
                  <button
                    key={`${opt.field}-${opt.order}`}
                    onClick={() => handleSortChange(opt.field, opt.order)}
                    className={`flex items-center justify-between px-3 py-2.5 text-sm text-left transition-colors ${
                      isActive
                        ? 'text-[var(--color-accent-light)] bg-[var(--color-accent)]/10'
                        : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]'
                    }`}
                  >
                    <span>{t(opt.labelKey)}</span>
                    {isActive && (
                      <Check className="w-4 h-4" strokeWidth={2} />
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Safe area padding for iOS home bar */}
        <div className="shrink-0" style={{ height: 'env(safe-area-inset-bottom)' }} />
      </div>
    </>,
    document.body,
  );
}
