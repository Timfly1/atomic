import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import {
  createFeed,
  ingestUrl as apiIngestUrl,
  importObsidianVault,
  type ImportResult,
  type IngestionResult,
} from '../../../lib/api';
import { isDesktopApp } from '../../../lib/transport';
import { pickDirectory } from '../../../lib/platform';
import type { OnboardingState, OnboardingAction } from '../useOnboardingState';

interface DataLoadingStepProps {
  state: OnboardingState;
  dispatch: React.Dispatch<OnboardingAction>;
}

export function DataLoadingStep({ state, dispatch }: DataLoadingStepProps) {
  const { t } = useTranslation();
  const isDesktop = isDesktopApp();

  // Feed state
  const [addingFeed, setAddingFeed] = useState(false);
  const [feedAdded, setFeedAdded] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  // URL ingest state
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<IngestionResult | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleAddFeed = async () => {
    if (!state.feedUrl.trim() || addingFeed) return;
    setAddingFeed(true);
    setFeedError(null);
    try {
      await createFeed(state.feedUrl.trim());
      setFeedAdded(true);
      dispatch({ type: 'SET_FEED_URL', value: '' });
    } catch (e) {
      setFeedError(String(e));
    } finally {
      setAddingFeed(false);
    }
  };

  const handleIngestUrl = async () => {
    if (!state.ingestUrl.trim() || ingesting) return;
    setIngesting(true);
    setIngestResult(null);
    setIngestError(null);
    try {
      const result = await apiIngestUrl(state.ingestUrl.trim());
      setIngestResult(result);
      dispatch({ type: 'SET_INGEST_URL', value: '' });
    } catch (e) {
      setIngestError(String(e));
    } finally {
      setIngesting(false);
    }
  };

  const handleObsidianImport = async () => {
    setImportResult(null);
    setImportError(null);
    try {
      const selected = await pickDirectory('Select Obsidian Vault');
      if (!selected) return;
      setIsImporting(true);
      const result = await importObsidianVault(selected);
      setImportResult(result);
    } catch (e) {
      setImportError(String(e));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-5 px-2">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-1">{t('onboarding_data_load_title')}</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {t('onboarding_data_load_subtitle')}
        </p>
      </div>

      {/* RSS Feed */}
      <div className="p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg space-y-3">
        <div>
          <h3 className="text-sm font-medium text-[var(--color-text-primary)]">{t('onboarding_data_rss_feed')}</h3>
          <p className="text-xs text-[var(--color-text-secondary)]">{t('onboarding_data_rss_feed_description')}</p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={state.feedUrl}
            onChange={(e) => dispatch({ type: 'SET_FEED_URL', value: e.target.value })}
            placeholder={t('onboarding_data_rss_feed_placeholder')}
            className="flex-1 px-3 py-2 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent text-sm"
          />
          <Button variant="secondary" onClick={handleAddFeed} disabled={!state.feedUrl.trim() || addingFeed}>
            {addingFeed ? t('onboarding_data_adding') : t('onboarding_data_add')}
          </Button>
        </div>
        {feedAdded && <p className="text-sm text-green-500">{t('onboarding_data_feed_added')}</p>}
        {feedError && <p className="text-sm text-red-500">{feedError}</p>}
      </div>

      {/* URL Ingest */}
      <div className="p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg space-y-3">
        <div>
          <h3 className="text-sm font-medium text-[var(--color-text-primary)]">{t('onboarding_data_ingest_url')}</h3>
          <p className="text-xs text-[var(--color-text-secondary)]">{t('onboarding_data_ingest_url_description')}</p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={state.ingestUrl}
            onChange={(e) => dispatch({ type: 'SET_INGEST_URL', value: e.target.value })}
            placeholder={t('onboarding_data_ingest_url_placeholder')}
            className="flex-1 px-3 py-2 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent text-sm"
          />
          <Button variant="secondary" onClick={handleIngestUrl} disabled={!state.ingestUrl.trim() || ingesting}>
            {ingesting ? t('onboarding_data_ingesting') : t('onboarding_data_ingest')}
          </Button>
        </div>
        {ingestResult && (
          <p className="text-sm text-green-500">
            {t('onboarding_data_ingested')}: {ingestResult.title}
          </p>
        )}
        {ingestError && <p className="text-sm text-red-500">{ingestError}</p>}
      </div>

      {/* Obsidian Import (desktop only) */}
      {isDesktop && (
        <div className="p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg space-y-3">
          <div>
            <h3 className="text-sm font-medium text-[var(--color-text-primary)]">{t('onboarding_data_import_obsidian')}</h3>
            <p className="text-xs text-[var(--color-text-secondary)]">{t('onboarding_data_import_obsidian_description')}</p>
          </div>
          <Button variant="secondary" onClick={handleObsidianImport} disabled={isImporting}>
            {isImporting ? t('onboarding_data_importing') : t('onboarding_data_select_vault')}
          </Button>
          {importResult && (
            <p className="text-sm text-green-500">
              {t('onboarding_data_imported_notes', { imported: importResult.imported, skipped: importResult.skipped })}
            </p>
          )}
          {importError && <p className="text-sm text-red-500">{importError}</p>}
        </div>
      )}
    </div>
  );
}
