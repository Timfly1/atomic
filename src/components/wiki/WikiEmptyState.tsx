import { useTranslation } from 'react-i18next';
import { FilePlus, Loader2, Zap } from 'lucide-react';

interface WikiEmptyStateProps {
  tagName: string;
  atomCount: number;
  onGenerate: () => void;
  isGenerating: boolean;
}

export function WikiEmptyState({ tagName, atomCount, onGenerate, isGenerating }: WikiEmptyStateProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center">
      {/* Document icon with plus */}
      <div className="w-16 h-16 mb-4 rounded-full bg-[var(--color-bg-card)] flex items-center justify-center">
        <FilePlus className="w-8 h-8 text-[var(--color-text-secondary)]" strokeWidth={2} />
      </div>

      <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
        {t('wiki_no_article_yet', { tagName })}
      </h3>

      <p className="text-sm text-[var(--color-text-secondary)] mb-6">
        {t('wiki_generate_from_atoms_count', { count: atomCount })}
      </p>

      <button
        onClick={onGenerate}
        disabled={isGenerating || atomCount === 0}
        className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
            {t('wiki_generating')}
          </>
        ) : (
          <>
            <Zap className="w-4 h-4" strokeWidth={2} />
            {t('wiki_generate_article')}
          </>
        )}
      </button>

      {atomCount === 0 && (
        <p className="text-xs text-[var(--color-text-tertiary)] mt-4">
          {t('wiki_add_atoms_first')}
        </p>
      )}
    </div>
  );
}

