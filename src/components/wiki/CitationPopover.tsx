import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useKeyboard } from '../../hooks/useKeyboard';

export interface CitationForPopover {
  citation_index: number;
  atom_id: string;
  excerpt: string;
}

interface CitationPopoverProps {
  citation: CitationForPopover;
  anchorRect: { top: number; left: number; bottom: number; width: number } | null;
  onClose: () => void;
  onViewAtom: (atomId: string, highlightText?: string) => void;
}

function calculatePosition(
  anchorRect: { top: number; left: number; bottom: number; width: number },
  popoverHeight: number,
  popoverWidth: number
): { top: number; left: number } {
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const spaceAbove = anchorRect.top;

  let top: number;
  if (spaceBelow >= popoverHeight + 8 || spaceBelow >= spaceAbove) {
    top = anchorRect.bottom + 8;
  } else {
    top = anchorRect.top - popoverHeight - 8;
  }

  let left = anchorRect.left + anchorRect.width / 2 - popoverWidth / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - popoverWidth - 8));

  return { top, left };
}

export function CitationPopover({ citation, anchorRect, onClose, onViewAtom }: CitationPopoverProps) {
  const { t } = useTranslation();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const dragStartX = useRef<number>(0);
  const dragStartY = useRef<number>(0);
  const currentX = useRef<number>(0);
  const isDragging = useRef<boolean>(false);

  useEffect(() => {
    if (anchorRect) {
      const estimatedPos = calculatePosition(anchorRect, 180, 400);
      setPosition(estimatedPos);

      const updatePosition = () => {
        if (popoverRef.current) {
          const rect = popoverRef.current.getBoundingClientRect();
          const refined = calculatePosition(anchorRect, rect.height, rect.width);
          setPosition(refined);
        }
      };

      requestAnimationFrame(updatePosition);
    }
  }, [anchorRect]);

  useKeyboard('Escape', onClose, true);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleViewAtom = () => {
    try {
      onViewAtom(citation.atom_id, citation.excerpt);
    } finally {
      handleClose();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    dragStartX.current = e.touches[0].clientX;
    dragStartY.current = e.touches[0].clientY;
    currentX.current = 0;
    isDragging.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - dragStartX.current;
    const deltaY = e.touches[0].clientY - dragStartY.current;

    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
      isDragging.current = true;
    }

    if (isDragging.current) {
      currentX.current = deltaX;
      if (popoverRef.current) {
        popoverRef.current.style.transform = `translateX(${deltaX}px)`;
        popoverRef.current.style.opacity = String(1 - Math.abs(deltaX) / 200);
      }
    }
  };

  const handleTouchEnd = () => {
    if (Math.abs(currentX.current) > 100) {
      handleClose();
    } else if (isDragging.current) {
      if (popoverRef.current) {
        popoverRef.current.style.transform = '';
        popoverRef.current.style.opacity = '';
      }
    }
    currentX.current = 0;
    isDragging.current = false;
  };

  const displayExcerpt = citation.excerpt.length > 300
    ? citation.excerpt.slice(0, 297) + '...'
    : citation.excerpt;

  if (!position) {
    return null;
  }

  return createPortal(
    <div
      ref={popoverRef}
      data-modal="true"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`
        fixed z-[100] w-[400px] max-w-[calc(100vw-16px)]
        bg-white dark:bg-[#2d2d2d] border border-[var(--color-border)] rounded-xl shadow-2xl
      `}
      style={{ top: position.top, left: position.left }}
    >
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border)]">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-[var(--color-accent)]/20 text-[var(--color-accent-light)] text-xs font-medium">
          {citation.citation_index}
        </span>
        <span className="text-xs text-[var(--color-text-secondary)]">{t('wiki_source_excerpt')}</span>
        <button
          onClick={handleClose}
          className="ml-auto p-1 rounded hover:bg-[var(--color-bg-hover)] transition-colors"
        >
          <X className="w-4 h-4 text-[var(--color-text-secondary)]" />
        </button>
      </div>

      <div className="px-4 py-3 prose prose-sm max-w-none text-[var(--color-text-primary)] [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-sm [&_h4]:text-sm [&_h1]:m-0 [&_h2]:m-0 [&_h3]:m-0 [&_h4]:m-0 max-h-[200px] overflow-y-auto">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {displayExcerpt}
        </ReactMarkdown>
      </div>

      <div className="px-4 py-2 border-t border-[var(--color-border)]">
        <button
          onClick={handleViewAtom}
          className="flex items-center gap-1 text-sm text-[var(--color-accent)] hover:text-[var(--color-accent-light)] transition-colors"
        >
          {t('wiki_view_full_atom')}
          <ArrowRight className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
    </div>,
    document.body
  );
}
