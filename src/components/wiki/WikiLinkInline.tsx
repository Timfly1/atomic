import { useTranslation } from 'react-i18next';

interface WikiLinkInlineProps {
  tagName: string;
  hasArticle: boolean;
  onClick: () => void;
}

export function WikiLinkInline({ tagName, hasArticle, onClick }: WikiLinkInlineProps) {
  const { t } = useTranslation();
  if (hasArticle) {
    return (
      <button
        onClick={onClick}
        className="text-[var(--color-accent)] hover:text-[var(--color-accent-light)] underline decoration-dotted underline-offset-2 cursor-pointer bg-transparent border-none p-0 font-inherit text-inherit"
        title={t('wiki_go_to_article', { tagName })}
      >
        {tagName}
      </button>
    );
  }

  return (
    <span
      className="text-[var(--color-text-tertiary)] cursor-default"
      title={t('wiki_article_not_generated')}
    >
      {tagName}
    </span>
  );
}
