import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Clock, RefreshCw, X, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { formatRelativeTime } from '../../lib/date';
import type { WikiVersionSummary } from '../../stores/wiki';

interface WikiHeaderProps {
  newAtomsAvailable: number;
  onUpdate: () => void;
  onRegenerate: () => void;
  onClose: () => void;
  isUpdating: boolean;
  onBack?: () => void;
  versions: WikiVersionSummary[];
  onSelectVersion: (versionId: string) => void;
  isViewingVersion: boolean;
  onReturnToCurrent: () => void;
  // Proposal review state
  hasProposal: boolean;
  isProposing: boolean;
  proposalAtomCount: number;
  onReviewProposal: () => void;
}

export function WikiHeader({
  newAtomsAvailable,
  onUpdate,
  onRegenerate,
  onClose,
  isUpdating,
  onBack,
  versions,
  onSelectVersion,
  isViewingVersion,
  onReturnToCurrent,
  hasProposal,
  isProposing,
  proposalAtomCount,
  onReviewProposal,
}: WikiHeaderProps) {
  const { t } = useTranslation();
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const versionsRef = useRef<HTMLDivElement>(null);

  const handleRegenerate = () => {
    setShowRegenerateModal(false);
    onRegenerate();
  };

  // Close versions dropdown on outside click
  useEffect(() => {
    if (!showVersions) return;
    const handleClick = (e: MouseEvent) => {
      if (versionsRef.current && !versionsRef.current.contains(e.target as Node)) {
        setShowVersions(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showVersions]);

  return (
    <div className="border-b border-[var(--color-border)]">
      {/* Version viewing banner */}
      {isViewingVersion && (
        <div className="flex items-center justify-between px-6 py-2 bg-amber-500/10 border-b border-amber-500/20">
          <span className="text-sm text-amber-400">
            {t('wiki_viewing_previous_version')}
          </span>
          <button
            onClick={onReturnToCurrent}
            className="text-sm text-amber-400 hover:text-amber-300 underline transition-colors"
          >
            {t('wiki_return_to_current')}
          </button>
        </div>
      )}

      {/* Compact toolbar */}
      <div className="flex items-center justify-end px-4 py-1.5">
        <div className="flex items-center gap-1">
          {onBack && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
            >
              <ChevronLeft className="w-4 h-4 mr-1" strokeWidth={2} />
              {t('wiki_back')}
            </Button>
          )}
          {/* Version history button */}
          {versions.length > 0 && (
            <div className="relative" ref={versionsRef}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowVersions(!showVersions)}
              >
                <Clock className="w-4 h-4 mr-1" strokeWidth={2} />
                {t('wiki_history')} ({versions.length})
              </Button>
              {showVersions && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-[#2d2d2d] border border-[var(--color-border)] rounded-lg shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
                  {isViewingVersion && (
                    <button
                      onClick={() => {
                        onReturnToCurrent();
                        setShowVersions(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-bg-hover)] transition-colors text-[var(--color-accent-light)] font-medium"
                    >
                      {t('wiki_current_version')}
                    </button>
                  )}
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        onSelectVersion(v.id);
                        setShowVersions(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-bg-hover)] transition-colors"
                    >
                      <div className="text-[var(--color-text-primary)]">
                        {t('wiki_version_number', { number: v.version_number })}
                      </div>
                      <div className="text-xs text-[var(--color-text-secondary)]">
                        {formatRelativeTime(v.created_at)} • {t('wiki_source_count', { count: v.atom_count })}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowRegenerateModal(true)}
            disabled={isUpdating || isViewingVersion}
          >
            <RefreshCw className="w-4 h-4 mr-1" strokeWidth={2} />
            {t('wiki_regenerate')}
          </Button>
          <button
            onClick={onClose}
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors p-1"
          >
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Proposal ready banner — takes precedence over the new-atoms banner */}
      {hasProposal && !isViewingVersion && (
        <div className="flex items-center justify-between px-6 py-2 bg-[var(--color-accent)]/15 border-t border-[var(--color-accent)]/30">
          <span className="text-sm text-[var(--color-accent-light)]">
            {t('wiki_suggested_update_ready')}
            {proposalAtomCount > 0 && (
              <> — {t('wiki_new_atoms_count', { count: proposalAtomCount })}</>
            )}
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={onReviewProposal}
          >
            {t('wiki_review')}
          </Button>
        </div>
      )}

      {/* New atoms banner — only when no proposal is pending */}
      {!hasProposal && newAtomsAvailable > 0 && !isViewingVersion && (
        <div className="flex items-center justify-between px-6 py-2 bg-[var(--color-accent)]/10 border-t border-[var(--color-accent)]/20">
          <span className="text-sm text-[var(--color-accent-light)]">
            {t('wiki_new_atoms_available', { count: newAtomsAvailable })}
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={onUpdate}
            disabled={isProposing || isUpdating}
          >
            {isProposing ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" strokeWidth={2} />
                {t('wiki_generating')}
              </>
            ) : (
              t('wiki_generate_update')
            )}
          </Button>
        </div>
      )}

      {/* Regenerate confirmation modal */}
      <Modal
        isOpen={showRegenerateModal}
        onClose={() => setShowRegenerateModal(false)}
        title={t('wiki_regenerate_article')}
        confirmLabel={t('wiki_regenerate')}
        confirmVariant="primary"
        onConfirm={handleRegenerate}
      >
        <p className="text-[var(--color-text-primary)]">
          {t('wiki_regenerate_warning')}
        </p>
      </Modal>
    </div>
  );
}
