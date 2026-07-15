import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, RefreshCw, ArrowLeft, BookOpen } from 'lucide-react';
import { useWikiStore } from '../../stores/wiki';
import { useUIStore } from '../../stores/ui';
import { WikiArticleContent } from './WikiArticleContent';
import { WikiEmptyState } from './WikiEmptyState';
import { WikiGenerating } from './WikiGenerating';
import { WikiProposalDiff } from './WikiProposalDiff';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { formatRelativeTime, formatRelativeDate } from '../../lib/date';

interface WikiReaderProps {
  tagId: string;
  tagName: string;
  highlightText?: string | null;
}

export function WikiReader({ tagId, tagName, highlightText }: WikiReaderProps) {
  const { t } = useTranslation();
  const currentArticle = useWikiStore(s => s.currentArticle);
  const articleStatus = useWikiStore(s => s.articleStatus);
  const relatedTags = useWikiStore(s => s.relatedTags);
  const wikiLinks = useWikiStore(s => s.wikiLinks);
  const isLoading = useWikiStore(s => s.isLoading);
  const isGenerating = useWikiStore(s => s.isGenerating);
  const isUpdating = useWikiStore(s => s.isUpdating);
  const error = useWikiStore(s => s.error);
  const clearError = useWikiStore(s => s.clearError);

  const fetchArticle = useWikiStore(s => s.fetchArticle);
  const fetchArticleStatus = useWikiStore(s => s.fetchArticleStatus);
  const fetchRelatedTags = useWikiStore(s => s.fetchRelatedTags);
  const fetchWikiLinks = useWikiStore(s => s.fetchWikiLinks);
  const generateArticle = useWikiStore(s => s.generateArticle);

  // Version history
  const versions = useWikiStore(s => s.versions);
  const selectedVersion = useWikiStore(s => s.selectedVersion);
  const fetchVersions = useWikiStore(s => s.fetchVersions);
  const selectVersion = useWikiStore(s => s.selectVersion);
  const clearSelectedVersion = useWikiStore(s => s.clearSelectedVersion);

  // Proposal state
  const proposal = useWikiStore(s => s.proposal);
  const isProposing = useWikiStore(s => s.isProposing);
  const isAccepting = useWikiStore(s => s.isAccepting);
  const isDismissing = useWikiStore(s => s.isDismissing);
  const reviewingProposal = useWikiStore(s => s.reviewingProposal);
  const proposeArticle = useWikiStore(s => s.proposeArticle);
  const acceptProposal = useWikiStore(s => s.acceptProposal);
  const dismissProposal = useWikiStore(s => s.dismissProposal);
  const startReviewingProposal = useWikiStore(s => s.startReviewingProposal);
  const stopReviewingProposal = useWikiStore(s => s.stopReviewingProposal);
  const fetchProposal = useWikiStore(s => s.fetchProposal);

  const overlayNavigate = useUIStore(s => s.overlayNavigate);
  const overlayDismiss = useUIStore(s => s.overlayDismiss);

  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const versionsRef = useRef<HTMLDivElement>(null);
  const prevTagIdRef = useRef<string | null>(null);

  // Fetch article data when tagId changes
  useEffect(() => {
    if (tagId === prevTagIdRef.current) return;
    prevTagIdRef.current = tagId;

    // Clear previous article state
    clearSelectedVersion();

    // Fetch all data for this article
    fetchArticle(tagId);
    fetchArticleStatus(tagId);
    fetchRelatedTags(tagId);
    fetchWikiLinks(tagId);
    fetchVersions(tagId);
    fetchProposal(tagId);
  }, [tagId]);

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

  // Escape key dismisses the wiki reader
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.ctrlKey || e.metaKey)) {
        useUIStore.getState().overlayDismiss();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleGenerate = () => {
    generateArticle(tagId, tagName);
  };

  const handleUpdate = () => {
    proposeArticle(tagId, tagName);
  };

  const handleViewAtom = (atomId: string, highlightText?: string) => {
    overlayNavigate({ type: 'reader', atomId, highlightText });
  };

  const handleNavigateToArticle = (targetTagId: string, targetTagName: string) => {
    overlayNavigate({ type: 'wiki', tagId: targetTagId, tagName: targetTagName });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--color-text-secondary)]">
        {t('common_loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-4">
        <p className="text-red-400 text-sm">{error}</p>
        <button onClick={clearError} className="text-xs text-[var(--color-accent)] hover:underline">
          {t('common_close')}
        </button>
      </div>
    );
  }

  if (isGenerating) {
    return <WikiGenerating tagName={tagName} atomCount={articleStatus?.current_atom_count || 0} />;
  }

  if (!currentArticle) {
    return (
      <WikiEmptyState
        tagName={tagName}
        atomCount={articleStatus?.current_atom_count || 0}
        onGenerate={handleGenerate}
        isGenerating={false}
      />
    );
  }

  const displayArticle = selectedVersion
    ? { content: selectedVersion.content, id: selectedVersion.id, tag_id: selectedVersion.tag_id, created_at: selectedVersion.created_at, updated_at: selectedVersion.created_at, atom_count: selectedVersion.atom_count }
    : currentArticle.article;
  const displayCitations = selectedVersion
    ? selectedVersion.citations
    : currentArticle.citations;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--color-bg-main)]">
      {/* Header — back button + icon + title + date */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--color-border)] flex-shrink-0">
        <button
          onClick={overlayDismiss}
          title={t('common_back')}
          aria-label={t('common_back')}
          className="
            p-1.5 rounded-md text-[var(--color-text-secondary)]
            hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]
            transition-colors
          "
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={2} />
        </button>

        <div className="flex items-center gap-2 min-w-0 flex-1">
          <BookOpen className="w-4 h-4 text-[var(--color-text-tertiary)] flex-shrink-0" strokeWidth={2} />
          <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
            {tagName}
          </span>
          {displayArticle.updated_at && (
            <>
              <span className="text-[var(--color-text-tertiary)]/40">·</span>
              <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-[var(--color-text-tertiary)] tabular-nums">
                {formatRelativeDate(displayArticle.updated_at).toUpperCase()}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Version viewing banner */}
      {selectedVersion && (
        <div className="flex items-center justify-between px-6 py-2 bg-amber-500/10 border-b border-amber-500/20 flex-shrink-0">
          <span className="text-sm text-amber-400">{t('wiki_viewing_previous_version')}</span>
          <button onClick={clearSelectedVersion} className="text-sm text-amber-400 hover:text-amber-300 underline transition-colors">
            {t('wiki_return_to_current')}
          </button>
        </div>
      )}

      {/* Proposal ready banner */}
      {!!proposal && !selectedVersion && (
        <div className="flex items-center justify-between px-6 py-2 bg-[var(--color-accent)]/15 border-b border-[var(--color-accent)]/30 flex-shrink-0">
          <span className="text-sm text-[var(--color-accent-light)]">
            {t('wiki_suggested_update_ready')}
            {proposal.new_atom_count > 0 && (
              <> — {t('wiki_new_atoms_count', { count: proposal.new_atom_count })}</>
            )}
          </span>
          <Button variant="primary" size="sm" onClick={startReviewingProposal}>{t('wiki_review')}</Button>
        </div>
      )}

      {/* New atoms available banner */}
      {!proposal && !selectedVersion && (articleStatus?.new_atoms_available || 0) > 0 && (
        <div className="flex items-center justify-between px-6 py-2 bg-[var(--color-accent)]/10 border-b border-[var(--color-accent)]/20 flex-shrink-0">
          <span className="text-sm text-[var(--color-accent-light)]">
            {t('wiki_new_atoms_available', { count: articleStatus!.new_atoms_available })}
          </span>
          <Button variant="primary" size="sm" onClick={handleUpdate} disabled={isProposing || isUpdating}>
            {isProposing ? t('wiki_generating') : t('wiki_generate_update')}
          </Button>
        </div>
      )}

      {/* Proposal diff view */}
      {reviewingProposal && proposal && !selectedVersion ? (
        <WikiProposalDiff
          liveContent={currentArticle.article.content}
          proposalContent={proposal.content}
          newAtomCount={proposal.new_atom_count}
          createdAt={proposal.created_at}
          onAccept={() => acceptProposal(tagId)}
          onDismiss={() => dismissProposal(tagId)}
          onCancel={stopReviewingProposal}
          isAccepting={isAccepting}
          isDismissing={isDismissing}
        />
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-auto-hide">
          <WikiArticleContent
            article={displayArticle}
            citations={displayCitations}
            wikiLinks={selectedVersion ? [] : wikiLinks}
            relatedTags={selectedVersion ? [] : relatedTags}
            tagName={tagName}
            updatedAt={selectedVersion ? selectedVersion.created_at : currentArticle.article.updated_at}
            sourceCount={displayCitations.length}
            highlightText={highlightText}
            titleActions={
              <>
                {/* Version history */}
                {versions.length > 0 && (
                  <div className="relative" ref={versionsRef}>
                    <Button variant="ghost" size="sm" onClick={() => setShowVersions(!showVersions)}>
                      <Clock className="w-4 h-4 mr-1" strokeWidth={2} />
                      {versions.length}
                    </Button>
                    {showVersions && (
                      <div className="absolute right-0 top-full mt-1 w-64 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
                        {selectedVersion && (
                          <button
                            onClick={() => { clearSelectedVersion(); setShowVersions(false); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-bg-hover)] transition-colors text-[var(--color-accent-light)] font-medium"
                          >
                            {t('wiki_current_version')}
                          </button>
                        )}
                        {versions.map((v) => (
                          <button
                            key={v.id}
                            onClick={() => { selectVersion(v.id); setShowVersions(false); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-bg-hover)] transition-colors"
                          >
                            <div className="text-[var(--color-text-primary)]">{t('wiki_version_number', { number: v.version_number })}</div>
                            <div className="text-xs text-[var(--color-text-secondary)]">
                              {formatRelativeTime(v.created_at)} • {t('wiki_source_count', { count: v.atom_count })}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* Regenerate */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRegenerateModal(true)}
                  disabled={isUpdating || !!selectedVersion}
                >
                  <RefreshCw className="w-4 h-4" strokeWidth={2} />
                </Button>
              </>
            }
            onViewAtom={handleViewAtom}
            onNavigateToArticle={handleNavigateToArticle}
          />
        </div>
      )}

      {/* Regenerate confirmation modal */}
      <Modal
        isOpen={showRegenerateModal}
        onClose={() => setShowRegenerateModal(false)}
        title={t('wiki_regenerate_article')}
        confirmLabel={t('wiki_regenerate')}
        confirmVariant="primary"
        onConfirm={() => {
          setShowRegenerateModal(false);
          handleGenerate();
        }}
      >
        <p className="text-[var(--color-text-primary)]">
          {t('wiki_regenerate_warning')}
        </p>
      </Modal>
    </div>
  );
}
