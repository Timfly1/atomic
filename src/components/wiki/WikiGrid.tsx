import { memo, useRef, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { WikiArticleSummary, SuggestedArticle } from '../../stores/wiki';
import { useUIStore } from '../../stores/ui';
import { WikiCard } from './WikiCard';
import { useContainerWidth } from '../../hooks/useContainerWidth';

const CARD_MIN_WIDTH = 260;
const CARD_GAP = 16;
const PADDING = 16;
const ROW_HEIGHT = 140;

interface WikiGridProps {
  articles: WikiArticleSummary[];
  suggestedArticles: SuggestedArticle[];
  onArticleClick: (tagId: string, tagName: string, opts?: { newTab?: boolean }) => void;
  onSuggestionClick: (tagId: string, tagName: string, opts?: { newTab?: boolean }) => void;
  onDeleteArticle?: (tagId: string) => void;
  isLoading?: boolean;
}

type GridItem =
  | { type: 'article'; article: WikiArticleSummary }
  | { type: 'suggestion'; suggestion: SuggestedArticle };

export const WikiGrid = memo(function WikiGrid({
  articles,
  suggestedArticles,
  onArticleClick,
  onSuggestionClick,
  onDeleteArticle,
  isLoading,
}: WikiGridProps) {
  const { t } = useTranslation();
  const parentRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(parentRef);
  const savedScrollPosition = useUIStore((s) => s.wikiListScrollPosition);
  const setWikiListScrollPosition = useUIStore((s) => s.setWikiListScrollPosition);

  // Save scroll position on scroll
  const handleScroll = useCallback(() => {
    if (parentRef.current) {
      setWikiListScrollPosition(parentRef.current.scrollTop);
    }
  }, [setWikiListScrollPosition]);

  // Restore scroll position when component mounts or data loads
  useEffect(() => {
    if (parentRef.current && savedScrollPosition > 0 && !isLoading) {
      requestAnimationFrame(() => {
        if (parentRef.current) {
          parentRef.current.scrollTop = savedScrollPosition;
        }
      });
    }
  }, [savedScrollPosition, isLoading]);

  const ready = containerWidth > 0;
  const columnCount = ready
    ? Math.max(1, Math.floor((containerWidth - PADDING * 2 + CARD_GAP) / (CARD_MIN_WIDTH + CARD_GAP)))
    : 1;

  // Merge articles and suggestions into a single grid items list
  const gridItems: GridItem[] = useMemo(() => {
    const items: GridItem[] = articles.map(article => ({ type: 'article', article }));
    for (const suggestion of suggestedArticles) {
      items.push({ type: 'suggestion', suggestion });
    }
    return items;
  }, [articles, suggestedArticles]);

  const rowCount = Math.ceil(gridItems.length / columnCount);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 3,
    gap: CARD_GAP,
    enabled: ready,
  });

  if (gridItems.length === 0 && isLoading) {
    return (
      <div ref={parentRef} className="h-full overflow-y-auto scrollbar-auto-hide p-4">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_MIN_WIDTH}px, 1fr))`,
            gap: `${CARD_GAP}px`,
          }}
        >
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex flex-col p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg h-[${ROW_HEIGHT}px]">
              <div className="flex-1">
                <div className="h-4 w-3/5 bg-[var(--color-border)] rounded animate-pulse" />
              </div>
              <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                <div className="h-3 w-20 bg-[var(--color-border)] rounded animate-pulse opacity-50" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (gridItems.length === 0) {
    return (
      <div ref={parentRef} className="flex flex-col items-center justify-center h-full text-center p-8">
        <BookOpen className="w-16 h-16 text-[var(--color-border)] mb-4" strokeWidth={1.5} />
        <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">{t('wiki_empty')}</h3>
        <p className="text-sm text-[var(--color-text-secondary)] max-w-sm">
          {t('wiki_empty_description_grid')}
        </p>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-full overflow-y-auto scrollbar-auto-hide" onScroll={handleScroll}>
      <div
        className="relative w-full p-4"
        style={{ height: `${virtualizer.getTotalSize() + PADDING * 2}px` }}
      >
        {ready && virtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * columnCount;
          const rowItems = gridItems.slice(startIndex, startIndex + columnCount);
          return (
            <div
              key={virtualRow.key}
              className="absolute left-4 right-4"
              style={{
                top: `${virtualRow.start}px`,
                height: `${virtualRow.size}px`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
                gap: `${CARD_GAP}px`,
              }}
            >
              {rowItems.map((item) => {
                if (item.type === 'article') {
                  return (
                    <WikiCard
                      key={item.article.id}
                      type="article"
                      article={item.article}
                      onClick={(opts) => onArticleClick(item.article.tag_id, item.article.tag_name, opts)}
                      onDelete={onDeleteArticle}
                    />
                  );
                } else {
                  return (
                    <WikiCard
                      key={`suggestion-${item.suggestion.tag_id}`}
                      type="suggestion"
                      suggestion={item.suggestion}
                      onClick={(opts) => onSuggestionClick(item.suggestion.tag_id, item.suggestion.tag_name, opts)}
                    />
                  );
                }
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
});
