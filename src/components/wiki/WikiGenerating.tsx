import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

interface WikiGeneratingProps {
  tagName: string;
  atomCount: number;
}

export function WikiGenerating({ tagName, atomCount }: WikiGeneratingProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center">
      {/* Spinner */}
      <Loader2 className="w-16 h-16 mb-6 animate-spin text-[var(--color-accent)]" strokeWidth={2} />

      <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
        {t('wiki_synthesizing_article', { tagName })}
      </h3>

      <p className="text-sm text-[var(--color-text-secondary)]">
        {t('wiki_processing_sources', { count: atomCount })}
      </p>

      <p className="text-xs text-[var(--color-text-tertiary)] mt-4">
        {t('wiki_may_take_a_moment')}
      </p>
    </div>
  );
}

