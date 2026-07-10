import { LayoutDashboard, Library, Network, BookOpen, Telescope } from 'lucide-react';
import { motion } from 'motion/react';
import { useUIStore } from '../../stores/ui';
import { ViewMode } from '../../stores/ui';

const NAV_ITEMS: { mode: ViewMode; Icon: typeof LayoutDashboard; label: string }[] = [
  { mode: 'dashboard', Icon: LayoutDashboard, label: 'Dashboard' },
  { mode: 'atoms', Icon: Library, label: 'Atoms' },
  { mode: 'canvas', Icon: Network, label: 'Canvas' },
  { mode: 'wiki', Icon: BookOpen, label: 'Wiki' },
  { mode: 'reports', Icon: Telescope, label: 'Reports' },
];

export function BottomNav() {
  const viewMode = useUIStore(s => s.viewMode);
  const setViewMode = useUIStore(s => s.setViewMode);
  const activeTabId = useUIStore(s => s.activeTabId);

  const onBaseView = activeTabId === null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 bg-[var(--color-bg-panel)] md:hidden">
      <div className="flex items-center justify-around h-14 border-t border-[var(--color-border)]">
        {NAV_ITEMS.map(({ mode, Icon, label }) => {
          const isActive = onBaseView && viewMode === mode;
          return (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`relative flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-md min-w-[56px] ${
                isActive
                  ? 'text-white'
                  : 'text-[var(--color-text-secondary)]'
              }`}
              title={label}
              aria-label={label}
            >
              {isActive && (
                <motion.div
                  layoutId="bottom-nav-blob"
                  className="absolute inset-0 bg-[var(--color-accent)] rounded-md"
                  transition={{ type: 'spring', stiffness: 520, damping: 32, mass: 0.9 }}
                />
              )}
              <Icon className="relative z-[1] w-5 h-5" strokeWidth={2} />
              <span className="relative z-[1] text-[10px] font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}