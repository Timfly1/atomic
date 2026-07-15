import { LayoutDashboard, Library, Network, BookOpen, Telescope } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../stores/ui';
import { ViewMode } from '../../stores/ui';

export function BottomNav() {
  const { t } = useTranslation();
  const viewMode = useUIStore(s => s.viewMode);
  const setViewMode = useUIStore(s => s.setViewMode);
  const activeTabId = useUIStore(s => s.activeTabId);

  const onBaseView = activeTabId === null;

  const NAV_ITEMS: { mode: ViewMode; Icon: typeof LayoutDashboard; labelKey: string }[] = [
    { mode: 'dashboard', Icon: LayoutDashboard, labelKey: 'nav_dashboard' },
    { mode: 'atoms', Icon: Library, labelKey: 'nav_atoms' },
    { mode: 'canvas', Icon: Network, labelKey: 'nav_canvas' },
    { mode: 'wiki', Icon: BookOpen, labelKey: 'nav_wiki' },
    { mode: 'reports', Icon: Telescope, labelKey: 'nav_reports' },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-20 bg-[var(--color-bg-panel)] md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 4px)' }}
    >
      <div className="relative flex items-stretch w-full border-t border-[var(--color-border)]" style={{ height: '48px' }}>
        {NAV_ITEMS.map(({ mode, Icon, labelKey }) => {
          const isActive = onBaseView && viewMode === mode;
          const label = t(labelKey);
          return (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className="flex-1 flex flex-col items-center justify-center pt-0.5 relative"
              title={label}
              aria-label={label}
            >
              <Icon
                className="w-7 h-7"
                strokeWidth={isActive ? 2.5 : 1.5}
                style={{
                  color: isActive
                    ? 'var(--color-accent)'
                    : 'var(--color-text-tertiary)',
                }}
              />
              <span
                className="text-[14px] leading-none font-medium"
                style={{
                  color: isActive
                    ? 'var(--color-accent)'
                    : 'var(--color-text-tertiary)',
                  marginTop: '3px',
                }}
              >
                {label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute bottom-0 w-5 h-0.75 rounded-full bg-[var(--color-accent)]"
                  transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.6 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
