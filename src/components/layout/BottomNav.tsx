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
      className="fixed bottom-0 left-0 right-0 z-20 md:hidden bottom-nav"
      style={{
        backgroundColor: 'var(--color-bg-panel)',
        height: 'calc(13px + env(safe-area-inset-bottom))',
      }}
    >
      <div
        className="relative flex items-center justify-center w-full h-full border-t border-[var(--color-border)]"
        style={{
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        {NAV_ITEMS.map(({ mode, Icon, labelKey }) => {
          const isActive = onBaseView && viewMode === mode;
          const label = t(labelKey);
          return (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className="flex-1 flex flex-col items-center justify-center relative transition-transform duration-150 active:scale-90"
              title={label}
              aria-label={label}
            >
              <Icon
                className="w-5 h-5 transition-all duration-200"
                strokeWidth={isActive ? 2 : 1.5}
                style={{
                  color: isActive
                    ? 'var(--color-accent)'
                    : 'var(--color-text-tertiary)',
                  filter: isActive ? 'drop-shadow(0 0 6px var(--color-accent))' : 'none',
                }}
              />
              <span
                className="text-[10px] leading-none font-medium tracking-wide transition-colors duration-200"
                style={{
                  color: isActive
                    ? 'var(--color-accent)'
                    : 'var(--color-text-tertiary)',
                  marginTop: '2px',
                  textShadow: isActive ? '0 0 8px var(--color-accent)' : 'none',
                }}
              >
                {label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute -bottom-0.5 w-4 h-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--color-accent)', boxShadow: '0 0 6px var(--color-accent)' }}
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
