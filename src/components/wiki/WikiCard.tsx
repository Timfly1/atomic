import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, BookOpen, Link2, Trash2 } from 'lucide-react';
import { WikiArticleSummary, SuggestedArticle } from '../../stores/wiki';
import { formatRelativeDate, formatShortRelativeDate } from '../../lib/date';
import { Modal } from '../ui/Modal';

interface WikiArticleCardProps {
  type: 'article';
  article: WikiArticleSummary;
  onClick: (opts?: { newTab?: boolean }) => void;
  onDelete?: (tagId: string) => void;
}

interface WikiSuggestionCardProps {
  type: 'suggestion';
  suggestion: SuggestedArticle;
  onClick: (opts?: { newTab?: boolean }) => void;
}

type WikiCardProps = WikiArticleCardProps | WikiSuggestionCardProps;

export const WikiCard = memo(function WikiCard(props: WikiCardProps) {
  const { t } = useTranslation();

  if (props.type === 'suggestion') {
    const { suggestion, onClick } = props;
    return (
      <div
        onClick={(e) => onClick({ newTab: e.metaKey || e.ctrlKey })}
        onAuxClick={(e) => {
          if (e.button === 1) {
            e.preventDefault();
            onClick({ newTab: true });
          }
        }}
        className="relative flex flex-col p-4 border border-dashed border-[var(--color-border)] rounded-lg cursor-pointer hover:border-[var(--color-accent)]/50 hover:bg-[var(--color-bg-card)]/50 transition-all duration-150 h-full min-w-0 overflow-hidden group"
      >
        <div className="flex-1 min-h-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-[var(--color-text-primary)] line-clamp-1">
              {suggestion.tag_name}
            </p>
            <Sparkles className="w-4 h-4 text-[var(--color-accent)] shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" strokeWidth={2} />
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-2 leading-relaxed">
            {t('wiki_generate_from_atoms', { count: suggestion.atom_count })}
          </p>
        </div>
        <div className="mt-3 pt-3 border-t border-dashed border-[var(--color-border)]">
          <span className="text-xs font-medium text-[var(--color-accent)] group-hover:text-[var(--color-accent-light)] transition-colors">
            {t('wiki_generate_article')}
          </span>
        </div>
      </div>
    );
  }

  const { article, onClick, onDelete } = props;
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  return (
    <>
      <div
        onClick={(e) => onClick({ newTab: e.metaKey || e.ctrlKey })}
        onAuxClick={(e) => {
          if (e.button === 1) {
            e.preventDefault();
            onClick({ newTab: true });
          }
        }}
        className="relative flex flex-col p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg cursor-pointer hover:border-[var(--color-border-hover)] hover:bg-[var(--color-bg-hover)] active:bg-[var(--color-accent)]/10 active:border-[var(--color-accent)]/30 transition-all duration-150 h-full min-w-0 overflow-hidden break-words"
      >
        <div className="flex-1 min-h-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-[var(--color-text-primary)] line-clamp-1 min-w-0">
              {article.tag_name}
            </p>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-[var(--color-text-tertiary)]" title={formatRelativeDate(article.updated_at)}>
                {formatShortRelativeDate(article.updated_at)}
              </span>
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteModal(true);
                  }}
                  className="p-1 rounded text-[var(--color-text-tertiary)] hover:text-red-500 hover:bg-red-500/10 transition-all"
                  title={t('common_delete')}
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)]">
              <BookOpen className="w-3.5 h-3.5" strokeWidth={2} />
              {article.atom_count} {article.atom_count === 1 ? t('wiki_source') : t('wiki_sources')}
            </span>
            {article.inbound_links > 0 && (
              <span className="flex items-center gap-1 text-xs text-[var(--color-accent-light)]">
                <Link2 className="w-3.5 h-3.5" strokeWidth={2} />
                {article.inbound_links} {article.inbound_links === 1 ? t('wiki_link') : t('wiki_links')}
              </span>
            )}
          </div>
        </div>
      </div>
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title={t('common_delete_confirm_title')}
        confirmLabel={t('common_delete')}
        confirmVariant="danger"
        onConfirm={() => {
          onDelete?.(article.tag_id);
          setShowDeleteModal(false);
        }}
      >
        <p>{t('wiki_delete_confirm_message', { name: article.tag_name })}</p>
      </Modal>
    </>
  );
}, (prev, next) => {
  if (prev.type !== next.type) return false;
  if (prev.type === 'article' && next.type === 'article') {
    return prev.article.id === next.article.id
      && prev.article.updated_at === next.article.updated_at
      && prev.article.atom_count === next.article.atom_count
      && prev.article.inbound_links === next.article.inbound_links;
  }
  if (prev.type === 'suggestion' && next.type === 'suggestion') {
    return prev.suggestion.tag_id === next.suggestion.tag_id
      && prev.suggestion.atom_count === next.suggestion.atom_count;
  }
  return false;
});
