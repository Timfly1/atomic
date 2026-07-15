import { memo, useRef, useEffect, useCallback } from 'react';
import { FileText } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { DisplayAtom } from '../../stores/atoms';
import { useUIStore } from '../../stores/ui';
import { AtomCard } from './AtomCard';
import { AtomCardSkeleton } from './AtomCardSkeleton';

interface AtomListProps {
  atoms: DisplayAtom[];
  onAtomClick: (atomId: string, opts?: { newTab?: boolean }) => void;
  getMatchingChunkContent?: (atomId: string) => string | undefined;
  onRetryEmbedding?: (atomId: string) => void;
  onRetryTagging?: (atomId: string) => void;
  onDelete?: (atomId: string) => void;
  onLoadMore?: () => void;
  isLoading?: boolean;
  isLoadingMore?: boolean;
}

export const AtomList = memo(function AtomList({
  atoms,
  onAtomClick,
  getMatchingChunkContent,
  onRetryEmbedding,
  onRetryTagging,
  onDelete,
  onLoadMore,
  isLoading,
  isLoadingMore,
}: AtomListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const savedScrollPosition = useUIStore((s) => s.atomsListScrollPosition);
  const setAtomsListScrollPosition = useUIStore((s) => s.setAtomsListScrollPosition);

  const virtualizer = useVirtualizer({
    count: atoms.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 10,
    gap: 8,
  });

  // Save scroll position on scroll
  const handleScroll = useCallback(() => {
    if (parentRef.current) {
      setAtomsListScrollPosition(parentRef.current.scrollTop);
    }
  }, [setAtomsListScrollPosition]);

  // Restore scroll position when component mounts
  useEffect(() => {
    if (parentRef.current && savedScrollPosition > 0) {
      requestAnimationFrame(() => {
        if (parentRef.current) {
          parentRef.current.scrollTop = savedScrollPosition;
        }
      });
    }
  }, [savedScrollPosition]);

  // Load more when nearing the end
  useEffect(() => {
    if (!onLoadMore) return;
    const items = virtualizer.getVirtualItems();
    if (items.length === 0) return;
    const lastItem = items[items.length - 1];
    if (lastItem && lastItem.index >= atoms.length - 10) {
      onLoadMore();
    }
  }, [virtualizer.getVirtualItems(), atoms.length, onLoadMore]);

  if (atoms.length === 0 && isLoading) {
    return (
      <div ref={parentRef} className="h-full overflow-y-auto scrollbar-auto-hide px-4 pt-4">
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <AtomCardSkeleton key={i} viewMode="list" />
          ))}
        </div>
      </div>
    );
  }

  if (atoms.length === 0) {
    return (
      <div ref={parentRef} className="flex flex-col items-center justify-center h-full text-center p-8">
        <FileText className="w-16 h-16 text-[var(--color-border)] mb-4" strokeWidth={1.5} />
        <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">No atoms yet</h3>
        <p className="text-sm text-[var(--color-text-secondary)] max-w-sm">
          Click the + button to create your first atom and start building your knowledge base.
        </p>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-full overflow-y-auto scrollbar-auto-hide" onScroll={handleScroll}>
      <div
        className="relative w-full px-4 pt-4"
        style={{ height: `${virtualizer.getTotalSize() + 16 + (isLoadingMore ? 48 : 0)}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const atom = atoms[virtualItem.index];
          return (
            <div
              key={atom.id}
              className="atom-list-item absolute left-4 right-4"
              style={{
                top: `${virtualItem.start}px`,
              }}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
            >
              <AtomCard
                atom={atom}
                onAtomClick={onAtomClick}
                viewMode="list"
                matchingChunkContent={getMatchingChunkContent?.(atom.id)}
                onRetryEmbedding={onRetryEmbedding}
                onRetryTagging={onRetryTagging}
                onDelete={onDelete}
              />
            </div>
          );
        })}
        {isLoadingMore && (
          <div
            className="absolute left-0 right-0 flex justify-center py-3"
            style={{ top: `${virtualizer.getTotalSize()}px` }}
          >
            <div className="h-5 w-5 border-2 border-[var(--color-border)] border-t-[var(--color-accent)] rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
});
