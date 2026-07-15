import { Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SettingsButtonProps {
  onClick: () => void;
}

export function SettingsButton({ onClick }: SettingsButtonProps) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] rounded transition-colors"
      title={t('settings_title')}
    >
      <Settings className="w-5 h-5" strokeWidth={2} />
    </button>
  );
}

