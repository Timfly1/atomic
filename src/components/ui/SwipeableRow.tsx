import { ReactNode, useCallback, useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { Trash2 } from 'lucide-react';
import { useUIStore } from '../../stores/ui';

export interface SwipeAction {
  icon?: ReactNode;
  label: string;
  color?: string;
  onClick: () => void;
}

export interface SwipeableRowProps {
  id: string;
  children: ReactNode;
  actions: SwipeAction[];
  threshold?: number;
  expandedWidth?: number;
  disabled?: boolean;
}

export function SwipeableRow({
  id,
  children,
  actions,
  threshold = 80,
  expandedWidth = 160,
  disabled = false,
}: SwipeableRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const dragStartX = useRef(0);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const isHorizontalSwipe = useRef(false);

  const swipeExpandedId = useUIStore((s) => s.swipeExpandedId);
  const setSwipeExpandedId = useUIStore((s) => s.setSwipeExpandedId);
  const closeSwipeDrawer = useUIStore((s) => s.closeSwipeDrawer);

  const isExpanded = swipeExpandedId === id;

  // When another drawer expands, close this one
  useEffect(() => {
    if (swipeExpandedId && swipeExpandedId !== id && isExpanded) {
      animate(x, 0, { duration: 0.2, ease: 'easeOut' });
    }
  }, [swipeExpandedId, id, isExpanded, x]);

  // Sync with external expanded state
  useEffect(() => {
    if (isExpanded) {
      x.set(-expandedWidth);
    } else {
      x.set(0);
    }
  }, [isExpanded, expandedWidth, x]);

  const handleActionClick = useCallback((action: SwipeAction) => {
    // Execute the action's onClick first
    action.onClick();
    // Then close the drawer
    closeSwipeDrawer();
  }, [closeSwipeDrawer]);

  const snapBack = useCallback(() => {
    animate(x, 0, { duration: 0.3, ease: 'spring' });
    closeSwipeDrawer();
  }, [x, closeSwipeDrawer]);

  const expand = useCallback(() => {
    animate(x, -expandedWidth, { duration: 0.2, ease: 'easeOut' });
    setSwipeExpandedId(id);
  }, [x, expandedWidth, setSwipeExpandedId, id]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return;

    isDragging.current = true;
    isHorizontalSwipe.current = false;
    dragStartX.current = e.clientX;
    startY.current = e.clientY;

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [disabled]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || disabled) return;

    const deltaX = e.clientX - dragStartX.current;
    const deltaY = e.clientY - startY.current;

    if (!isHorizontalSwipe.current && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
      isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
      if (!isHorizontalSwipe.current) {
        isDragging.current = false;
        return;
      }
    }

    if (!isHorizontalSwipe.current) return;

    // Only allow left swipe (negative delta)
    if (deltaX >= 0) {
      x.set(isExpanded ? -expandedWidth : 0);
      return;
    }

    const clampedDelta = Math.max(-expandedWidth, deltaX);
    x.set(clampedDelta);
  }, [disabled, isExpanded, expandedWidth, x]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || disabled) return;
    isDragging.current = false;

    if (!isHorizontalSwipe.current) return;

    const currentX = x.get();
    if (Math.abs(currentX) >= threshold) {
      expand();
    } else {
      snapBack();
    }
  }, [disabled, threshold, expand, snapBack, x]);

  const handlePointerCancel = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Handle click on content area when drawer is expanded - close it
  const handleContentClick = useCallback((e: React.MouseEvent) => {
    if (isExpanded && !isDragging.current) {
      e.stopPropagation();
      snapBack();
    }
  }, [isExpanded, snapBack]);

  // Calculate button widths based on number of actions
  const buttonWidth = Math.min(expandedWidth / actions.length, 80);

  return (
    <div ref={containerRef} className="relative overflow-hidden">
      {/* Action buttons background - hidden when not expanded */}
      <div
        className="absolute inset-y-0 right-0 flex transition-opacity duration-200"
        style={{
          width: expandedWidth,
          opacity: isExpanded ? 1 : 0,
          pointerEvents: isExpanded ? 'auto' : 'none',
        }}
      >
        {actions.map((action, index) => {
          const isDelete = index === actions.length - 1;
          return (
            <button
              key={index}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleActionClick(action);
              }}
              className="flex flex-col items-center justify-center gap-1 h-full text-white transition-colors active:brightness-75"
              style={{
                width: buttonWidth,
                backgroundColor: action.color ?? (isDelete ? '#ef4444' : '#3b82f6'),
              }}
            >
              <span className="text-lg">{action.icon ?? <Trash2 className="w-5 h-5" />}</span>
              <span className="text-xs font-medium">{action.label}</span>
            </button>
          );
        })}
      </div>

      {/* Swipeable content */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={handleContentClick}
        style={{ touchAction: 'pan-y' }}
        className="relative bg-[var(--color-bg-card)]"
      >
        <motion.div style={{ x }}>
          {children}
        </motion.div>
      </div>
    </div>
  );
}