import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  X,
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Pause,
  Play,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
  Download,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { CustomSelect } from '../ui/CustomSelect';
import { SearchableSelect } from '../ui/SearchableSelect';
import { ConnectionStatus } from '../ui/ConnectionStatus';
import { Modal } from '../ui/Modal';
import { useSettingsStore } from '../../stores/settings';
import { useAtomsStore } from '../../stores/atoms';
import { useTagsStore, type TagWithCount } from '../../stores/tags';
import { THEMES, Theme } from '../../hooks/useTheme';
import { FONTS, Font } from '../../hooks/useFont';
import {
  getAvailableLlmModels,
  getOpenRouterEmbeddingModels,
  testOllamaConnection,
  testOpenAICompatConnection,
  testFeishuConnection,
  getOllamaModels,
  getMcpStdioConfig,
  getMcpHttpConfig,
  listApiTokens,
  createApiToken,
  revokeApiToken,
  ingestUrl,
  listFeeds,
  createFeed,
  updateFeed,
  deleteFeed,
  pollFeed,
  type AvailableModel,
  type OpenRouterEmbeddingModel,
  type OllamaModel,
  type ImportResult,
  type McpConfig,
  type ApiTokenInfo,
  type CreateTokenResponse,
  type Feed,
  getAllPipelineStatuses,
  retryFailedEmbeddings,
  retryFailedTagging,
  reembedAllAtoms,
  retagAllAtoms,
  exportDatabaseMarkdownArchive,
  type ExportJob,
  type DatabasePipelineStatus,
  exportLogs,
  type IngestionResult,
  type FeedPollResult,
} from '../../lib/api';
import { getTransport, switchTransport, switchToLocal, isDesktopApp, isLocalServer, getLocalServerConfig, getMcpBridgePath, type HttpTransportConfig } from '../../lib/transport';
import { pickDirectory, isMacOS, openExternalUrl } from '../../lib/platform';
import { importMarkdownFolder, type ImportProgress } from '../../lib/import';
import { importAppleNotes, AppleNotesImportError } from '../../lib/import-apple-notes';

/** macOS deep-link that opens the Full Disk Access pane in System Settings. */
const MACOS_FULL_DISK_ACCESS_URL =
  'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AllFiles';
import { formatRelativeDate } from '../../lib/date';
import { getBrowserTimeZone, getSupportedTimeZones } from '../../lib/tz';
import { useTranslation } from 'react-i18next';
import { languages, toasti18n } from '../../i18n';
import { useDatabasesStore, type DatabaseInfo, type DatabaseStats } from '../../stores/databases';
import { OverrideControls } from './OverrideControls';

export type SettingsTab = 'general' | 'ai' | 'tag-categories' | 'connection' | 'integrations' | 'databases' | 'prompts';

const SETTINGS_TABS: { id: SettingsTab; labelKey: string }[] = [
  { id: 'general', labelKey: 'settings_tabs_general' },
  { id: 'ai', labelKey: 'settings_tabs_ai_models' },
  { id: 'prompts', labelKey: 'settings_tabs_prompts' },
  { id: 'tag-categories', labelKey: 'settings_tabs_tags' },
  { id: 'connection', labelKey: 'settings_tabs_connection' },
  { id: 'integrations', labelKey: 'settings_tabs_integrations' },
  { id: 'databases', labelKey: 'settings_tabs_databases' },
];

function TagCategoriesTab() {
  const { t } = useTranslation();
  const tags = useTagsStore(s => s.tags);
  const fetchTags = useTagsStore(s => s.fetchTags);
  const setTagAutotagTarget = useTagsStore(s => s.setTagAutotagTarget);
  const setTagAutotagDescription = useTagsStore(s => s.setTagAutotagDescription);
  const createTag = useTagsStore(s => s.createTag);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedTagId, setExpandedTagId] = useState<string | null>(null);
  const [descriptionDrafts, setDescriptionDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // Top-level tags only — flag is currently constrained to root tags.
  const topLevel = tags.filter(t => !t.parent_id);
  const targets = topLevel.filter(t => t.is_autotag_target);
  const available = topLevel.filter(t => !t.is_autotag_target);

  const handleToggle = async (id: string, value: boolean) => {
    setErrorMsg(null);
    try {
      await setTagAutotagTarget(id, value);
    } catch (e) {
      setErrorMsg(String(e));
    }
  };

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (trimmed.includes('/')) {
      setErrorMsg(t('settings_tag_categories_error_slash'));
      return;
    }
    if (topLevel.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) {
      setErrorMsg(t('settings_tag_categories_error_exists', { name: trimmed }));
      return;
    }
    setCreating(true);
    setErrorMsg(null);
    try {
      const created = await createTag(trimmed);
      await setTagAutotagTarget(created.id, true);
      setNewName('');
    } catch (e) {
      setErrorMsg(String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleDescriptionChange = (id: string, value: string) => {
    setDescriptionDrafts(current => ({ ...current, [id]: value }));
  };

  const handleDescriptionSave = async (tag: TagWithCount) => {
    const draft = descriptionDrafts[tag.id] ?? tag.autotag_description ?? '';
    if (draft === (tag.autotag_description ?? '')) return;
    setErrorMsg(null);
    try {
      await setTagAutotagDescription(tag.id, draft);
      setDescriptionDrafts(current => {
        const next = { ...current };
        delete next[tag.id];
        return next;
      });
    } catch (e) {
      setErrorMsg(String(e));
    }
  };

  return (
    <>
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-[var(--color-text-primary)]">{t('settings_tag_categories_title')}</h3>
        <p className="text-xs text-[var(--color-text-secondary)]">
          {t('settings_tag_categories_description')}
        </p>
      </div>

      {targets.length === 0 && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
          {t('settings_tag_categories_no_targets_warning')}
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">{t('settings_tag_categories_active_targets')}</div>
        {targets.length === 0 ? (
          <p className="text-xs text-[var(--color-text-secondary)] italic">{t('settings_tag_categories_none_yet')}</p>
        ) : (
          <div className="space-y-1">
            {targets.map(tag => {
              const isExpanded = expandedTagId === tag.id;
              const description = tag.autotag_description ?? '';
              const draft = descriptionDrafts[tag.id] ?? description;

              return (
              <div
                key={tag.id}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)]"
              >
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setExpandedTagId(isExpanded ? null : tag.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    title={isExpanded ? t('settings_tag_categories_hide_description') : t('settings_tag_categories_edit_description')}
                  >
                    <ChevronRight
                      className={`h-4 w-4 flex-shrink-0 text-[var(--color-text-tertiary)] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      strokeWidth={2}
                    />
                    <span className="text-sm text-[var(--color-text-primary)] truncate">{tag.name}</span>
                    <span className="text-[10px] text-[var(--color-text-tertiary)]">
                      {(tag as TagWithCount).atom_count} {t('settings_databases_atoms_count', { count: (tag as TagWithCount).atom_count }).split(' ').pop()}
                    </span>
                    {description.trim() && (
                      <span className="text-[10px] text-[var(--color-accent)]">
                        {t('settings_tag_categories_description_label')}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => handleToggle(tag.id, false)}
                    className="px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] rounded transition-colors"
                  >
                    {t('settings_tag_categories_unflag')}
                  </button>
                </div>
                {isExpanded && (
                  <div className="border-t border-[var(--color-border)] px-3 pb-3 pt-2">
                    <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                      {t('settings_tag_categories_description_label')}
                    </label>
                    <textarea
                      value={draft}
                      onChange={e => handleDescriptionChange(tag.id, e.target.value)}
                      onBlur={() => handleDescriptionSave(tag)}
                      placeholder={t('settings_tag_categories_description_placeholder')}
                      rows={3}
                      className="w-full resize-y rounded border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-secondary)]/50 focus:border-[var(--color-accent)]"
                    />
                  </div>
                )}
              </div>
            );
            })}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">{t('settings_tag_categories_available_tags')}</div>
        {available.length === 0 ? (
          <p className="text-xs text-[var(--color-text-secondary)] italic">{t('settings_tag_categories_all_targets')}</p>
        ) : (
          <div className="space-y-1">
            {available.map(tag => (
              <div
                key={tag.id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-[var(--color-text-primary)] truncate">{tag.name}</span>
                  <span className="text-[10px] text-[var(--color-text-tertiary)]">
                    {(tag as TagWithCount).atom_count} {t('settings_databases_atoms_count', { count: (tag as TagWithCount).atom_count }).split(' ').pop()}
                  </span>
                </div>
                <button
                  onClick={() => handleToggle(tag.id, true)}
                  className="px-2 py-1 text-xs text-[var(--color-accent)] hover:bg-[var(--color-bg-hover)] rounded transition-colors"
                >
                  {t('settings_tag_categories_mark_as_target')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">{t('settings_tag_categories_create_new')}</div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            placeholder={t('settings_tag_categories_placeholder')}
            disabled={creating}
            className="flex-1 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded px-3 py-1.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
          />
          <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
            {creating ? t('settings_tag_categories_adding') : t('settings_tag_categories_add')}
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className="text-xs text-red-400">{errorMsg}</div>
      )}
    </>
  );
}

function pipelineSummary(t: (key: string) => string, status?: DatabasePipelineStatus['status']) {
  if (!status) {
    return {
      tone: 'muted' as const,
      label: t('settings_pipeline_loading'),
      detail: t('settings_pipeline_checking'),
    };
  }

  const failed = status.failed_count + status.tagging_failed_count;
  const pending = status.pending + status.tagging_pending;
  const processing = status.processing + status.tagging_processing;

  if (failed > 0) {
    const parts = [
      status.failed_count > 0 ? `${status.failed_count} ${t('settings_pipeline_embeddings').toLowerCase()}` : null,
      status.tagging_failed_count > 0 ? `${status.tagging_failed_count} ${t('settings_pipeline_tagging').toLowerCase()}` : null,
    ].filter(Boolean);
    return {
      tone: 'error' as const,
      label: t('settings_pipeline_needs_attention'),
      detail: `${parts.join(', ')} ${t('settings_pipeline_failed').toLowerCase()}`,
    };
  }

  if (processing > 0 || pending > 0) {
    const parts = [
      pending > 0 ? `${pending} ${t('settings_pipeline_pending').toLowerCase()}` : null,
      processing > 0 ? `${processing} ${t('settings_pipeline_processing').toLowerCase()}` : null,
    ].filter(Boolean);
    return {
      tone: 'working' as const,
      label: t('settings_pipeline_working'),
      detail: parts.join(', '),
    };
  }

  return {
    tone: 'healthy' as const,
    label: t('settings_pipeline_healthy'),
    detail: `${status.complete} ${t('settings_pipeline_embeddings').toLowerCase()} · ${status.tagging_complete} ${t('settings_pipeline_tagging').toLowerCase()}${status.tagging_skipped > 0 ? ` · ${status.tagging_skipped} ${t('settings_pipeline_skipped').toLowerCase()}` : ''}`,
  };
}

function PipelineDetailCounts({ status }: { status: DatabasePipelineStatus['status'] }) {
  const { t } = useTranslation();
  const cellClass = 'px-2 py-1.5 text-right tabular-nums';
  const labelClass = 'px-2 py-1.5 text-left font-medium text-[var(--color-text-secondary)]';

  return (
    <div className="overflow-x-auto rounded border border-[var(--color-border)] bg-[var(--color-bg-panel)]">
      <table className="w-full min-w-[560px] text-xs">
        <thead className="text-[var(--color-text-tertiary)]">
          <tr className="border-b border-[var(--color-border)]">
            <th className={labelClass}>{t('settings_pipeline_stage')}</th>
            <th className={cellClass}>{t('settings_pipeline_pending')}</th>
            <th className={cellClass}>{t('settings_pipeline_processing')}</th>
            <th className={cellClass}>{t('settings_pipeline_complete')}</th>
            <th className={cellClass}>{t('settings_pipeline_skipped')}</th>
            <th className={cellClass}>{t('settings_pipeline_failed')}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[var(--color-border)]">
            <td className={labelClass}>{t('settings_pipeline_embeddings')}</td>
            <td className={cellClass}>{status.pending}</td>
            <td className={cellClass}>{status.processing}</td>
            <td className={cellClass}>{status.complete}</td>
            <td className={cellClass}>-</td>
            <td className={`${cellClass} ${status.failed_count > 0 ? 'text-red-300 font-medium' : ''}`}>{status.failed_count}</td>
          </tr>
          <tr>
            <td className={labelClass}>{t('settings_pipeline_tagging')}</td>
            <td className={cellClass}>{status.tagging_pending}</td>
            <td className={cellClass}>{status.tagging_processing}</td>
            <td className={cellClass}>{status.tagging_complete}</td>
            <td className={cellClass}>{status.tagging_skipped}</td>
            <td className={`${cellClass} ${status.tagging_failed_count > 0 ? 'text-red-300 font-medium' : ''}`}>{status.tagging_failed_count}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function DatabasesTab() {
  const { t } = useTranslation();
  const { databases, activeId, fetchDatabases, renameDatabase, deleteDatabase, setDefaultDatabase, getDatabaseStats } = useDatabasesStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteDb, setConfirmDeleteDb] = useState<DatabaseInfo | null>(null);
  const [deleteStats, setDeleteStats] = useState<DatabaseStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pipelineItems, setPipelineItems] = useState<DatabasePipelineStatus[]>([]);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [reembeddingDb, setReembeddingDb] = useState<string | null>(null);
  const [retaggingDb, setRetaggingDb] = useState<string | null>(null);
  const [exportingDb, setExportingDb] = useState<string | null>(null);
  const [exportJobsByDb, setExportJobsByDb] = useState<Record<string, ExportJob>>({});
  const [confirmReembedDb, setConfirmReembedDb] = useState<DatabaseInfo | null>(null);
  const [confirmRetagDb, setConfirmRetagDb] = useState<DatabaseInfo | null>(null);
  const [expandedPipeline, setExpandedPipeline] = useState<string | null>(null);
  const liveRefreshTimer = useRef<ReturnType<typeof setTimeout>>();

  const pipelineByDb = useMemo(() => {
    return new Map(pipelineItems.map(item => [item.database.id, item.status]));
  }, [pipelineItems]);

  useEffect(() => {
    fetchDatabases();
  }, [fetchDatabases]);

  const loadPipelineStatuses = useCallback(async (silent = false) => {
    if (!silent) setPipelineLoading(true);
    setPipelineError(null);
    try {
      setPipelineItems(await getAllPipelineStatuses());
    } catch (e) {
      setPipelineError(String(e));
    } finally {
      if (!silent) setPipelineLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPipelineStatuses();
  }, [loadPipelineStatuses]);

  useEffect(() => {
    const transport = getTransport();
    const scheduleRefresh = () => {
      clearTimeout(liveRefreshTimer.current);
      liveRefreshTimer.current = setTimeout(() => {
        void loadPipelineStatuses(true);
      }, 600);
    };

    const events = [
      'atom-created',
      'atom-updated',
      'embedding-started',
      'embedding-complete',
      'tagging-complete',
      'embeddings-reset',
      'pipeline-queue-started',
      'pipeline-queue-progress',
      'pipeline-queue-completed',
    ];
    const unsubs = events.map(event => transport.subscribe(event, scheduleRefresh));

    return () => {
      clearTimeout(liveRefreshTimer.current);
      unsubs.forEach(unsub => unsub());
    };
  }, [loadPipelineStatuses]);

  const handleRename = async (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) { setEditingId(null); return; }
    await renameDatabase(id, trimmed);
    setEditingId(null);
  };

  const handleStartDelete = async (db: DatabaseInfo) => {
    setConfirmDeleteDb(db);
    setDeleteStats(null);
    setIsLoadingStats(true);
    try {
      const stats = await getDatabaseStats(db.id);
      setDeleteStats(stats);
    } catch {
      setDeleteStats({ atom_count: -1 });
    }
    setIsLoadingStats(false);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteDb) return;
    setIsDeleting(true);
    try {
      await deleteDatabase(confirmDeleteDb.id);
      setConfirmDeleteDb(null);
    } catch {
      // Keep dialog open so user can retry or cancel
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    await setDefaultDatabase(id);
  };

  const handleExportMarkdown = async (db: DatabaseInfo) => {
    if (exportingDb) return;
    setExportingDb(db.id);
    setPipelineError(null);
    try {
      const job = await exportDatabaseMarkdownArchive(db.id, progress => {
        setExportJobsByDb(current => ({ ...current, [db.id]: progress }));
      });
      toasti18n.success('settings_databases_export_success', { values: { count: job.total_atoms, plural: job.total_atoms === 1 ? 'atom' : 'atoms' } });
    } catch (e) {
      toasti18n.error('settings_databases_export_failed', { description: String(e) });
    } finally {
      setExportingDb(null);
    }
  };

  const retryFailed = async (dbId: string, stage: 'embedding' | 'tagging') => {
    const key = `${dbId}:${stage}`;
    setRetrying(key);
    setPipelineError(null);
    try {
      const count = stage === 'embedding'
        ? await retryFailedEmbeddings(dbId)
        : await retryFailedTagging(dbId);
      toasti18n.success('settings_databases_retry_queued', { values: { count, stage: stage === 'embedding' ? t('settings_pipeline_embeddings').toLowerCase() : t('settings_pipeline_tagging').toLowerCase(), plural: count === 1 ? 'job' : 'jobs' } });
      await loadPipelineStatuses();
    } catch (e) {
      setPipelineError(String(e));
    } finally {
      setRetrying(null);
    }
  };

  const handleConfirmReembedAll = async () => {
    if (!confirmReembedDb || reembeddingDb) return;
    const db = confirmReembedDb;
    setReembeddingDb(db.id);
    setPipelineError(null);
    try {
      const count = await reembedAllAtoms(db.id);
      toasti18n.success('settings_databases_reembed_queued', { values: { count, plural: count === 1 ? 'atom' : 'atoms' } });
      setConfirmReembedDb(null);
      await loadPipelineStatuses();
    } catch (e) {
      setPipelineError(String(e));
    } finally {
      setReembeddingDb(null);
    }
  };

  const handleConfirmRetagAll = async () => {
    if (!confirmRetagDb || retaggingDb) return;
    const db = confirmRetagDb;
    setRetaggingDb(db.id);
    setPipelineError(null);
    try {
      const count = await retagAllAtoms(db.id);
      toasti18n.success('settings_databases_retag_queued', { values: { count, plural: count === 1 ? 'atom' : 'atoms' } });
      setConfirmRetagDb(null);
      await loadPipelineStatuses();
    } catch (e) {
      setPipelineError(String(e));
    } finally {
      setRetaggingDb(null);
    }
  };

  return (
    <>
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-[var(--color-text-primary)]">{t('settings_databases_title')}</h3>
        <p className="text-xs text-[var(--color-text-secondary)]">
          {t('settings_databases_description')}
        </p>
      </div>

      <div className="space-y-2">
        {databases.map(db => {
          const status = pipelineByDb.get(db.id);
          const summary = pipelineSummary(t, status);
          const embeddingRetryKey = `${db.id}:embedding`;
          const taggingRetryKey = `${db.id}:tagging`;
          const exportJob = exportJobsByDb[db.id];
          const isExpanded = expandedPipeline === db.id;
          const summaryClass = summary.tone === 'error'
            ? 'text-red-300'
            : summary.tone === 'working'
              ? 'text-amber-300'
              : summary.tone === 'healthy'
                ? 'text-green-300'
                : 'text-[var(--color-text-secondary)]';

          return (
            <div
              key={db.id}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)]"
            >
              <div className="flex items-start gap-3 px-3 py-2.5">
                {editingId === db.id ? (
                  <input
                    autoFocus
                    className="flex-1 bg-transparent border border-[var(--color-accent)] rounded px-2 py-1 text-sm text-[var(--color-text-primary)] outline-none"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRename(db.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onBlur={() => handleRename(db.id)}
                  />
                ) : (
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[var(--color-text-primary)] truncate font-medium">{db.name}</span>
                      {db.is_default && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-accent)]/20 text-[var(--color-accent)] font-medium">
                          {t('settings_databases_default_badge')}
                        </span>
                      )}
                      {db.id === activeId && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-medium">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className={`font-medium ${summaryClass}`}>{summary.label}</span>
                      <span className="text-[var(--color-text-secondary)]">{summary.detail}</span>
                    </div>
                  </div>
                )}

                {editingId !== db.id && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {status && status.failed_count > 0 && (
                      <button
                        onClick={() => retryFailed(db.id, 'embedding')}
                        disabled={retrying === embeddingRetryKey}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                        title={t('settings_databases_retry_failed_embeddings')}
                      >
                        {retrying === embeddingRetryKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} /> : <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />}
                        Emb
                      </button>
                    )}
                    {status && status.tagging_failed_count > 0 && (
                      <button
                        onClick={() => retryFailed(db.id, 'tagging')}
                        disabled={retrying === taggingRetryKey}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                        title={t('settings_databases_retry_failed_tagging')}
                      >
                        {retrying === taggingRetryKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} /> : <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />}
                        Tag
                      </button>
                    )}
                    {status && (
                      <button
                        onClick={() => setExpandedPipeline(isExpanded ? null : db.id)}
                        className="px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] rounded transition-colors"
                      >
                        {isExpanded ? t('settings_databases_hide') : t('settings_databases_details')}
                      </button>
                    )}
                    <button
                      onClick={() => handleExportMarkdown(db)}
                      disabled={!!exportingDb}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
                      title={t('settings_databases_export_desc')}
                    >
                      {exportingDb === db.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} /> : <Download className="w-3.5 h-3.5" strokeWidth={2} />}
                      {exportingDb === db.id && exportJob?.total_atoms
                        ? `${Math.round((exportJob.processed_atoms / exportJob.total_atoms) * 100)}%`
                        : t('settings_databases_export')}
                    </button>
                    {!db.is_default && (
                      <button
                        onClick={() => handleSetDefault(db.id)}
                        className="px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] rounded transition-colors"
                        title={t('settings_databases_set_default')}
                      >
                        {t('settings_databases_set_default')}
                      </button>
                    )}
                    <button
                      onClick={() => { setEditingId(db.id); setEditName(db.name); }}
                      className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] rounded transition-colors"
                      title={t('settings_databases_rename')}
                    >
                      <Pencil width="14" height="14" strokeWidth={2} />
                    </button>
                    {!db.is_default && (
                      <button
                        onClick={() => handleStartDelete(db)}
                        className="p-1.5 text-[var(--color-text-tertiary)] hover:text-red-400 hover:bg-[var(--color-bg-hover)] rounded transition-colors"
                        title={t('settings_databases_delete')}
                      >
                        <Trash2 width="14" height="14" strokeWidth={2} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {isExpanded && status && (
                <div className="px-3 pb-3 space-y-3">
                  <PipelineDetailCounts status={status} />
                  {status.complete > 0 && (
                    <div className="flex items-center justify-between gap-3 rounded border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-[var(--color-text-primary)]">{t('settings_databases_recalculate_embeddings')}</div>
                        <div className="text-[11px] text-[var(--color-text-secondary)]">
                          {t('settings_databases_recalculate_embeddings_desc')}
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setConfirmReembedDb(db)}
                        disabled={reembeddingDb === db.id}
                        title={t('settings_databases_recalculate_embeddings')}
                        className="flex-shrink-0 gap-1"
                      >
                        {reembeddingDb === db.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} /> : <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />}
                        {t('settings_databases_reembed_action')}
                      </Button>
                    </div>
                  )}
                  {status.complete > 0 && (
                    <div className="flex items-center justify-between gap-3 rounded border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-[var(--color-text-primary)]">{t('settings_databases_rerun_autotagging')}</div>
                        <div className="text-[11px] text-[var(--color-text-secondary)]">
                          {t('settings_databases_rerun_autotagging_desc')}
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setConfirmRetagDb(db)}
                        disabled={retaggingDb === db.id}
                        title={t('settings_databases_rerun_autotagging')}
                        className="flex-shrink-0 gap-1"
                      >
                        {retaggingDb === db.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} /> : <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />}
                        {t('settings_databases_retag_action')}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {databases.length === 0 && (
        <p className="text-sm text-[var(--color-text-secondary)] text-center py-4">{t('settings_databases_no_databases')}</p>
      )}

      {pipelineError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-md text-sm text-red-300">
          {pipelineError}
        </div>
      )}

      {pipelineLoading && databases.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
          <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />
          {t('settings_pipeline_checking')}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Modal
        isOpen={!!confirmDeleteDb}
        onClose={() => {
          if (!isDeleting) setConfirmDeleteDb(null);
        }}
        title={t('settings_databases_delete_title')}
        showFooter={false}
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-text-secondary)]">
            {t('settings_databases_delete_confirm', { name: confirmDeleteDb?.name, count: deleteStats?.atom_count ?? 0 })}
          </p>
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmDeleteDb(null)}
              disabled={isDeleting}
            >
              {t('settings_databases_delete_cancel')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={isDeleting || isLoadingStats}
            >
              {isDeleting ? t('settings_databases_deleting') : t('settings_databases_delete_action')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!confirmReembedDb}
        onClose={() => {
          if (!reembeddingDb) setConfirmReembedDb(null);
        }}
        title={t('settings_databases_reembed_title')}
        showFooter={false}
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-text-secondary)]">
            {t('settings_databases_reembed_desc', { name: confirmReembedDb?.name })}
          </p>
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmReembedDb(null)}
              disabled={!!reembeddingDb}
            >
              {t('settings_databases_reembed_cancel')}
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmReembedAll}
              disabled={!!reembeddingDb}
            >
              {reembeddingDb === confirmReembedDb?.id ? t('settings_databases_reembed_queuing') : t('settings_databases_reembed_action')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!confirmRetagDb}
        onClose={() => {
          if (!retaggingDb) setConfirmRetagDb(null);
        }}
        title={t('settings_databases_retag_title')}
        showFooter={false}
      >
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-text-secondary)]">
            {t('settings_databases_retag_desc', { name: confirmRetagDb?.name })}
          </p>
          <ul className="text-xs text-[var(--color-text-secondary)] space-y-1 pl-4 list-disc">
            <li>{t('settings_databases_retag_preserved_1')}</li>
            <li>{t('settings_databases_retag_preserved_2')}</li>
            <li>{t('settings_databases_retag_preserved_3')}</li>
          </ul>
          {(() => {
            const legacy = confirmRetagDb
              ? pipelineByDb.get(confirmRetagDb.id)?.legacy_auto_tag_count ?? 0
              : 0;
            if (legacy <= 0) return null;
            return (
              <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5">
                {t('settings_databases_retag_legacy_warning', { count: legacy.toLocaleString() })}
              </p>
            );
          })()}
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmRetagDb(null)}
              disabled={!!retaggingDb}
            >
              {t('settings_databases_retag_cancel')}
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmRetagAll}
              disabled={!!retaggingDb}
            >
              {retaggingDb === confirmRetagDb?.id ? t('settings_databases_retag_queuing') : t('settings_databases_retag_action')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}

export function SettingsModal({ isOpen, onClose, initialTab }: SettingsModalProps) {
  const settings = useSettingsStore(s => s.settings);
  const fetchSettings = useSettingsStore(s => s.fetchSettings);
  const setSetting = useSettingsStore(s => s.setSetting);
  const testOpenRouterConnection = useSettingsStore(s => s.testOpenRouterConnection);
  const { t, i18n } = useTranslation();
  // Per-DB context was previously consumed by the briefing schedule panel,
  // which moved onto the reports primitive in phase 3. Removing the
  // selectors keeps the modal from re-rendering on unrelated DB-list
  // changes; phase 4's report-authoring UI will pull what it needs back.

  // Theme & Font
  const [theme, setTheme] = useState<Theme>('obsidian');
  const [font, setFont] = useState<Font>('ibm-plex-sans');
  const [timezone, setTimezone] = useState(getBrowserTimeZone());
  const normalizeLang = (lang: string) => lang.startsWith('zh') ? 'zh' : lang.split('-')[0];
  const [language, setLanguage] = useState(normalizeLang(i18n.language) || 'en');
  const supportedTimeZones = useMemo(() => getSupportedTimeZones(), []);

  // Provider selection
  const [provider, setProvider] = useState<'openrouter' | 'ollama' | 'openai_compat'>('openrouter');

  // OpenRouter settings
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const [openrouterContextLength, setOpenrouterContextLength] = useState('');

  // OpenAI Compatible settings
  const [openaiCompatBaseUrl, setOpenaiCompatBaseUrl] = useState('');
  const [openaiCompatApiKey, setOpenaiCompatApiKey] = useState('');
  const [openaiCompatShowApiKey, setOpenaiCompatShowApiKey] = useState(false);
  const [openaiCompatEmbeddingModel, setOpenaiCompatEmbeddingModel] = useState('');
  const [openaiCompatEmbeddingDimension, setOpenaiCompatEmbeddingDimension] = useState('1536');
  const [openaiCompatLlmModel, setOpenaiCompatLlmModel] = useState('');
  const [openaiCompatContextLength, setOpenaiCompatContextLength] = useState('65536');
  const [openaiCompatTimeoutSecs, setOpenaiCompatTimeoutSecs] = useState('300');
  const [openaiCompatStatus, setOpenaiCompatStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [openaiCompatError, setOpenaiCompatError] = useState<string | null>(null);

  // Ollama settings
  const [ollamaHost, setOllamaHost] = useState('http://127.0.0.1:11434');
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [ollamaError, setOllamaError] = useState<string | undefined>();
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [ollamaEmbeddingModel, setOllamaEmbeddingModel] = useState('nomic-embed-text');
  const [ollamaLlmModel, setOllamaLlmModel] = useState('llama3.2');
  const [ollamaContextLength, setOllamaContextLength] = useState('65536');
  const [ollamaTimeoutSecs, setOllamaTimeoutSecs] = useState('120');
  const [isLoadingOllamaModels, setIsLoadingOllamaModels] = useState(false);

  // Separate embedding provider settings
  const [embeddingProvider, setEmbeddingProvider] = useState<'openrouter' | 'ollama' | 'openai_compat' | ''>('');
  const [embeddingProviderUrl, setEmbeddingProviderUrl] = useState('');

  // Feishu settings
  const [feishuAppId, setFeishuAppId] = useState('');
  const [feishuAppSecret, setFeishuAppSecret] = useState('');
  const [feishuShowSecret, setFeishuShowSecret] = useState(false);
  const [feishuStatus, setFeishuStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [feishuError, setFeishuError] = useState<string | null>(null);

  // Common settings
  const [autoTaggingEnabled, setAutoTaggingEnabled] = useState(true);
  const [embeddingModel, setEmbeddingModel] = useState('openai/text-embedding-3-small');
  const [taggingModel, setTaggingModel] = useState('openai/gpt-4o-mini');
  const [wikiModel, setWikiModel] = useState('anthropic/claude-sonnet-4.6');
  const [wikiStrategy, setWikiStrategy] = useState('centroid');
  const [wikiGenerationPrompt, setWikiGenerationPrompt] = useState('');
  const [wikiUpdatePrompt, setWikiUpdatePrompt] = useState('');
  const [chatPrompt, setChatPrompt] = useState('');
  const [diaryEnabled, setDiaryEnabled] = useState(false);
  const [diaryTemplate, setDiaryTemplate] = useState('');
  const [taggingPrompt, setTaggingPrompt] = useState('');
  const [chatModel, setChatModel] = useState('anthropic/claude-sonnet-4.6');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Re-embedding confirmation
  const [pendingEmbeddingChange, setPendingEmbeddingChange] = useState<{ key: string; value: string; label: string } | null>(null);

  // OpenRouter model loading
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [openrouterEmbeddingModels, setOpenrouterEmbeddingModels] = useState<OpenRouterEmbeddingModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importTags, setImportTags] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab ?? 'general');

  // When the modal is reopened with a new initialTab, sync the active tab.
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Integrations tab: collapsible sections — only one open at a time.
  const [expandedIntegration, setExpandedIntegration] = useState<
    'markdown' | 'apple-notes' | 'mcp' | null
  >(null);

  // MCP setup state
  const showMcpSetup = expandedIntegration === 'mcp';
  const [mcpConfig, setMcpConfig] = useState<McpConfig | null>(null);
  const [mcpConfigCopied, setMcpConfigCopied] = useState(false);
  const [isCreatingMcpToken, setIsCreatingMcpToken] = useState(false);
  const [mcpTokenError, setMcpTokenError] = useState<string | null>(null);

  // Remote server state
  const [serverUrl, setServerUrl] = useState('');
  const [serverToken, setServerToken] = useState('');
  const [isTestingServer, setIsTestingServer] = useState(false);
  const [serverTestResult, setServerTestResult] = useState<'success' | 'error' | null>(null);
  const [serverTestError, setServerTestError] = useState<string | null>(null);
  const [showChangeServer, setShowChangeServer] = useState(false);

  // API Token management state
  const [apiTokens, setApiTokens] = useState<ApiTokenInfo[]>([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [isCreatingToken, setIsCreatingToken] = useState(false);
  const [createdToken, setCreatedToken] = useState<CreateTokenResponse | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [showTokenSection, setShowTokenSection] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [localUrlCopied, setLocalUrlCopied] = useState(false);
  const [localTokenCopied, setLocalTokenCopied] = useState(false);

  // Feeds state
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [feedsLoading, setFeedsLoading] = useState(false);
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [addingFeed, setAddingFeed] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  // Ingest URL state
  const [ingestUrlValue, setIngestUrlValue] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<IngestionResult | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  // Feed action state
  const [pollingFeedId, setPollingFeedId] = useState<string | null>(null);
  const [pollResult, setPollResult] = useState<FeedPollResult | null>(null);
  const [deletingFeedId, setDeletingFeedId] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);

  // Derived: whether we're connected to a remote (non-local) server
  // Desktop + local sidecar → false; Desktop + remote override → true; Web → always true
  const isRemoteMode = isDesktopApp() ? !isLocalServer() : true;
  const localServerConfig = isDesktopApp() ? getLocalServerConfig() : null;

  // Check Ollama connection
  const checkOllamaConnection = useCallback(async (host: string) => {
    setOllamaStatus('checking');
    setOllamaError(undefined);
    try {
      const connected = await testOllamaConnection(host);
      if (connected) {
        setOllamaStatus('connected');
        // Fetch available models
        setIsLoadingOllamaModels(true);
        const models = await getOllamaModels(host);
        setOllamaModels(models);
        setIsLoadingOllamaModels(false);
      } else {
        setOllamaStatus('disconnected');
        setOllamaError('Could not connect to Ollama');
      }
    } catch (e) {
      setOllamaStatus('disconnected');
      setOllamaError(String(e));
      setIsLoadingOllamaModels(false);
    }
  }, []);

  // Test remote server connection
  const handleTestServer = async () => {
    if (!serverUrl.trim() || !serverToken.trim()) return;
    setIsTestingServer(true);
    setServerTestResult(null);
    setServerTestError(null);
    try {
      const resp = await fetch(`${serverUrl.trim().replace(/\/$/, '')}/health`);
      if (resp.ok) {
        setServerTestResult('success');
      } else {
        setServerTestResult('error');
        setServerTestError(`Server returned ${resp.status}`);
      }
    } catch (e) {
      setServerTestResult('error');
      setServerTestError(String(e));
    } finally {
      setIsTestingServer(false);
    }
  };

  const handleConnectServer = async () => {
    try {
      await switchTransport({ baseUrl: serverUrl.trim().replace(/\/$/, ''), authToken: serverToken.trim() });
      setShowChangeServer(false);
      // Refresh data from new source
      fetchSettings();
      fetchAtoms();
      fetchTags();
    } catch (e) {
      setServerTestResult('error');
      setServerTestError(String(e));
    }
  };

  const handleDisconnectServer = async () => {
    try {
      await switchToLocal();
      // Refresh data from local source
      fetchSettings();
      fetchAtoms();
      fetchTags();
    } catch (e) {
      console.error('Failed to switch to local:', e);
      toast.error('Failed to switch to local server', { description: String(e) });
    }
  };

  // Load API tokens for remote mode
  const loadApiTokens = useCallback(async () => {
    setIsLoadingTokens(true);
    try {
      const tokens = await listApiTokens();
      setApiTokens(tokens);
    } catch (e) {
      console.error('Failed to load API tokens:', e);
      toast.error('Failed to load API tokens', { description: String(e) });
    } finally {
      setIsLoadingTokens(false);
    }
  }, []);

  // Create new API token
  const handleCreateToken = async () => {
    if (!newTokenName.trim() || isCreatingToken) return;
    setIsCreatingToken(true);
    try {
      const result = await createApiToken(newTokenName.trim());
      setCreatedToken(result);
      setNewTokenName('');
      setTokenCopied(false);
      // Refresh token list
      await loadApiTokens();
    } catch (e) {
      console.error('Failed to create token:', e);
      toast.error('Failed to create API token', { description: String(e) });
    } finally {
      setIsCreatingToken(false);
    }
  };

  // Revoke an API token
  const handleRevokeToken = async (tokenId: string) => {
    // Check if revoking the current token
    const currentPrefix = serverToken.substring(0, 10);
    const tokenToRevoke = apiTokens.find(t => t.id === tokenId);
    const isCurrentToken = tokenToRevoke && tokenToRevoke.token_prefix === currentPrefix;

    try {
      await revokeApiToken(tokenId);
      if (isCurrentToken) {
        // Revoking current token — log out
        localStorage.removeItem('atomic-server-config');
        window.location.reload();
        return;
      }
      // Refresh list
      await loadApiTokens();
    } catch (e) {
      console.error('Failed to revoke token:', e);
      toast.error('Failed to revoke token', { description: String(e) });
    } finally {
      setConfirmRevokeId(null);
    }
  };

  // Load feeds
  const loadFeeds = useCallback(async () => {
    setFeedsLoading(true);
    setFeedError(null);
    try {
      const result = await listFeeds();
      setFeeds(result);
    } catch (e) {
      console.error('Failed to load feeds:', e);
      toast.error('Failed to load feeds', { description: String(e) });
      setFeedError(String(e));
    } finally {
      setFeedsLoading(false);
    }
  }, []);

  // Ingest a single URL
  const handleIngestUrl = async () => {
    if (!ingestUrlValue.trim() || ingesting) return;
    setIngesting(true);
    setIngestResult(null);
    setIngestError(null);
    try {
      const result = await ingestUrl(ingestUrlValue.trim());
      setIngestResult(result);
      setIngestUrlValue('');
    } catch (e) {
      setIngestError(String(e));
    } finally {
      setIngesting(false);
    }
  };

  // Add a new feed
  const handleAddFeed = async () => {
    if (!newFeedUrl.trim() || addingFeed) return;
    setAddingFeed(true);
    setFeedError(null);
    try {
      await createFeed(newFeedUrl.trim());
      setNewFeedUrl('');
      await loadFeeds();
    } catch (e) {
      setFeedError(String(e));
    } finally {
      setAddingFeed(false);
    }
  };

  // Poll a feed
  const handlePollFeed = async (feedId: string) => {
    setPollingFeedId(feedId);
    setPollResult(null);
    try {
      const result = await pollFeed(feedId);
      setPollResult(result);
      await loadFeeds();
    } catch (e) {
      setFeedError(String(e));
    } finally {
      setPollingFeedId(null);
    }
  };

  // Toggle feed pause/resume
  const handleToggleFeedPause = async (feed: Feed) => {
    try {
      await updateFeed(feed.id, { isPaused: !feed.is_paused });
      await loadFeeds();
    } catch (e) {
      setFeedError(String(e));
    }
  };

  // Delete a feed
  const handleDeleteFeed = async (feedId: string) => {
    setDeletingFeedId(feedId);
    try {
      await deleteFeed(feedId);
      await loadFeeds();
    } catch (e) {
      setFeedError(String(e));
    } finally {
      setDeletingFeedId(null);
    }
  };

  // Copy text to clipboard, with fallback for non-secure contexts (HTTP)
  const copyToClipboard = async (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  };

  // Copy created token to clipboard
  const handleCopyToken = async () => {
    if (!createdToken) return;
    try {
      await copyToClipboard(createdToken.token);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  const handleCopyLocalUrl = async () => {
    if (!localServerConfig) return;
    try {
      await copyToClipboard(localServerConfig.baseUrl);
      setLocalUrlCopied(true);
      setTimeout(() => setLocalUrlCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy local server URL:', e);
    }
  };

  const handleCopyLocalToken = async () => {
    if (!localServerConfig?.authToken) return;
    try {
      await copyToClipboard(localServerConfig.authToken);
      setLocalTokenCopied(true);
      setTimeout(() => setLocalTokenCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy local API token:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      // Load saved server config, defaulting to current origin
      const saved = localStorage.getItem('atomic-server-config');
      if (saved) {
        const config: HttpTransportConfig = JSON.parse(saved);
        setServerUrl(config.baseUrl);
        setServerToken(config.authToken);
      } else {
        setServerUrl(window.location.origin);
      }
      // Only fetch settings/models if transport is actually connected
      const transport = getTransport();
      if (transport.isConnected()) {
        fetchSettings();
        // Fetch OpenRouter models
        setIsLoadingModels(true);
        getAvailableLlmModels()
          .then(models => setAvailableModels(models))
          .catch(err => { console.error('Failed to load models:', err); toast.error('Failed to load models', { description: String(err) }); })
          .finally(() => setIsLoadingModels(false));
        // Fetch curated OpenRouter embedding model registry
        getOpenRouterEmbeddingModels()
          .then(models => setOpenrouterEmbeddingModels(models))
          .catch(err => { console.error('Failed to load embedding models:', err); });
      }
      // Load API tokens when connected to a non-local server
      if (!isLocalServer() && transport.isConnected()) {
        loadApiTokens();
      }
      // Reset token creation state
      setCreatedToken(null);
      setTokenCopied(false);
      setShowTokenSection(false);
      setConfirmRevokeId(null);
    }
  }, [isOpen, fetchSettings, loadApiTokens]);

  // Load feeds when integrations tab is active.
  useEffect(() => {
    if (isOpen && activeTab === 'integrations' && getTransport().isConnected()) {
      loadFeeds();
      // Reset ingest state when switching to integrations tab
      setIngestResult(null);
      setIngestError(null);
      setPollResult(null);
      setFeedError(null);
    }
  }, [isOpen, activeTab, loadFeeds]);

  // Load settings into state
  useEffect(() => {
    const p = settings.provider as 'openrouter' | 'ollama' | 'openai_compat' | undefined;
    setTheme((settings.theme as Theme) || 'obsidian');
    setFont((settings.font as Font) || 'ibm-plex-sans');
    setTimezone(settings.timezone || getBrowserTimeZone());
    setProvider(p || 'openrouter');
    setApiKey(settings.openrouter_api_key || '');
    setOpenrouterContextLength(settings.openrouter_context_length || '');
    setAutoTaggingEnabled(settings.auto_tagging_enabled !== 'false');
    setEmbeddingModel(settings.embedding_model || 'openai/text-embedding-3-small');
    setTaggingModel(settings.tagging_model || 'openai/gpt-4o-mini');
    setWikiModel(settings.wiki_model || 'anthropic/claude-sonnet-4.6');
    setWikiStrategy(settings.wiki_strategy || 'centroid');
    setWikiGenerationPrompt(settings.wiki_generation_prompt || '');
    setWikiUpdatePrompt(settings.wiki_update_prompt || '');
    setChatPrompt(settings.chat_prompt || '');
    setDiaryEnabled(settings.diary_enabled === 'true');
    setDiaryTemplate(settings.diary_template || '');
    setTaggingPrompt(settings.tagging_prompt || '');
    setChatModel(settings.chat_model || 'anthropic/claude-sonnet-4.6');
    setOllamaHost(settings.ollama_host || 'http://127.0.0.1:11434');
    setOllamaEmbeddingModel(settings.ollama_embedding_model || 'nomic-embed-text');
    setOllamaLlmModel(settings.ollama_llm_model || 'llama3.2');
    setOllamaContextLength(settings.ollama_context_length || '65536');
    setOllamaTimeoutSecs(settings.ollama_timeout_secs || '120');
    setOpenaiCompatBaseUrl(settings.openai_compat_base_url || '');
    setOpenaiCompatApiKey(settings.openai_compat_api_key || '');
    setOpenaiCompatEmbeddingModel(settings.openai_compat_embedding_model || '');
    setOpenaiCompatEmbeddingDimension(settings.openai_compat_embedding_dimension || '1536');
    setOpenaiCompatLlmModel(settings.openai_compat_llm_model || '');
    setOpenaiCompatContextLength(settings.openai_compat_context_length || '65536');
    setOpenaiCompatTimeoutSecs(settings.openai_compat_timeout_secs || '300');
    setEmbeddingProvider(settings.embedding_provider as 'openrouter' | 'ollama' | 'openai_compat' | '' || '');
    setEmbeddingProviderUrl(settings.embedding_provider_url || '');
    setFeishuAppId(settings.feishu_app_id || '');
    setFeishuAppSecret(settings.feishu_app_secret || '');
  }, [settings]);

  // Check Ollama connection when provider is ollama or host changes.
  // Debounced so typing into the host field doesn't fire a request per keystroke.
  useEffect(() => {
    if (!isOpen || provider !== 'ollama') return;
    const handle = setTimeout(() => checkOllamaConnection(ollamaHost), 400);
    return () => clearTimeout(handle);
  }, [isOpen, provider, ollamaHost, checkOllamaConnection]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.querySelector('[data-modal="true"]')) return;
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  // Auto-save a single setting (non-setup mode only)
  const autoSave = useCallback(async (key: string, value: string) => {
    try {
      await setSetting(key, value);
    } catch (e) {
      console.error(`Failed to save ${key}:`, e);
      setSaveError(`Failed to save setting`);
      setTimeout(() => setSaveError(null), 3000);
    }
  }, [setSetting]);

  // Handle changes that trigger re-embedding — ask for confirmation
  const handleEmbeddingModelChange = (value: string) => {
    setPendingEmbeddingChange({ key: 'embedding_model', value, label: value.split('/').pop() || value });
  };

  const handleOllamaEmbeddingModelChange = (value: string) => {
    setPendingEmbeddingChange({ key: 'ollama_embedding_model', value, label: value });
  };

  const handleOpenaiCompatEmbeddingModelChange = (value: string) => {
    setPendingEmbeddingChange({ key: 'openai_compat_embedding_model', value, label: value });
  };

  const handleOpenaiCompatEmbeddingDimensionChange = (value: string) => {
    setPendingEmbeddingChange({ key: 'openai_compat_embedding_dimension', value, label: `${value} dimensions` });
  };

  const confirmEmbeddingChange = async () => {
    if (!pendingEmbeddingChange) return;
    const { key, value } = pendingEmbeddingChange;
    if (key === 'embedding_model') setEmbeddingModel(value);
    if (key === 'ollama_embedding_model') setOllamaEmbeddingModel(value);
    if (key === 'openai_compat_embedding_model') setOpenaiCompatEmbeddingModel(value);
    if (key === 'openai_compat_embedding_dimension') setOpenaiCompatEmbeddingDimension(value);
    await autoSave(key, value);
    setPendingEmbeddingChange(null);
  };

  const cancelEmbeddingChange = () => {
    setPendingEmbeddingChange(null);
  };

  // Test OpenAI Compatible connection
  const checkOpenaiCompatConnection = useCallback(async (baseUrl: string, apiKey?: string) => {
    if (!baseUrl.trim()) return;
    setOpenaiCompatStatus('checking');
    setOpenaiCompatError(null);
    try {
      await testOpenAICompatConnection(baseUrl, apiKey || undefined);
      setOpenaiCompatStatus('connected');
    } catch (e) {
      setOpenaiCompatStatus('error');
      setOpenaiCompatError(String(e));
    }
  }, []);

  // Test Feishu connection
  const checkFeishuConnection = useCallback(async (appId: string, appSecret: string) => {
    if (!appId.trim() || !appSecret.trim()) return;
    setFeishuStatus('checking');
    setFeishuError(null);
    try {
      await testFeishuConnection(appId, appSecret);
      setFeishuStatus('connected');
    } catch (e) {
      setFeishuStatus('error');
      setFeishuError(String(e));
    }
  }, []);

  // Handle provider change — test connection automatically
  const handleProviderChange = async (value: 'openrouter' | 'ollama' | 'openai_compat') => {
    setProvider(value);
    await autoSave('provider', value);
    // Test connection for new provider
    if (value === 'openrouter' && apiKey.trim()) {
      setIsTesting(true);
      setTestResult(null);
      setTestError(null);
      try {
        await testOpenRouterConnection(apiKey);
        setTestResult('success');
      } catch (e) {
        setTestResult('error');
        setTestError(String(e));
      } finally {
        setIsTesting(false);
      }
    } else if (value === 'openai_compat' && openaiCompatBaseUrl.trim()) {
      checkOpenaiCompatConnection(openaiCompatBaseUrl, openaiCompatApiKey || undefined);
    }
  };

  // API key — local state updates immediately, auto-save on blur
  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    setTestResult(null);
    setTestError(null);
  };

  const handleApiKeyBlur = async () => {
    if (!apiKey.trim()) return;
    await autoSave('openrouter_api_key', apiKey);
    // Test connection with new key
    setIsTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      await testOpenRouterConnection(apiKey);
      setTestResult('success');
    } catch (e) {
      setTestResult('error');
      setTestError(String(e));
    } finally {
      setIsTesting(false);
    }
  };

  // Toggle a section in the Integrations tab. When opening the MCP section,
  // also lazy-load the bridge config.
  const toggleIntegration = async (key: 'markdown' | 'apple-notes' | 'mcp') => {
    const opening = expandedIntegration !== key;
    setExpandedIntegration(opening ? key : null);
    if (!(opening && key === 'mcp')) return;

    const nowLocal = isDesktopApp() && isLocalServer();
    const configIsStdio = mcpConfig && 'command' in (mcpConfig as any).mcpServers.atomic;
    if ((nowLocal && !configIsStdio && mcpConfig) || (!nowLocal && configIsStdio)) {
      setMcpConfig(null);
      setMcpTokenError(null);
    }

    if (nowLocal && !mcpConfig) {
      const bridgePath = await getMcpBridgePath();
      if (bridgePath) {
        setMcpConfig(getMcpStdioConfig(bridgePath));
      } else {
        setMcpTokenError('Could not locate atomic-mcp-bridge. Ensure the app bundle is complete.');
      }
    }
  };

  const handleCreateMcpToken = async () => {
    setIsCreatingMcpToken(true);
    setMcpTokenError(null);
    try {
      const result = await createApiToken('mcp-integration');
      const transport = getTransport() as import('../../lib/transport/http').HttpTransport;
      const config = getMcpHttpConfig(transport.getConfig().baseUrl, result.token);
      setMcpConfig(config);
    } catch (e) {
      setMcpTokenError(String(e));
    } finally {
      setIsCreatingMcpToken(false);
    }
  };

  // Copy MCP config to clipboard
  const handleCopyMcpConfig = async () => {
    if (!mcpConfig) return;
    try {
      await copyToClipboard(JSON.stringify(mcpConfig, null, 2));
      setMcpConfigCopied(true);
      setTimeout(() => setMcpConfigCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  // Handle Obsidian import
  const fetchAtoms = useAtomsStore((state) => state.fetchAtoms);
  const fetchTags = useTagsStore((state) => state.fetchTags);

  const handleObsidianImport = async () => {
    setImportResult(null);
    setImportError(null);
    setImportProgress(null);

    try {
      // Open folder picker dialog
      const selected = await pickDirectory('Select Markdown Folder');

      if (!selected) {
        return; // User cancelled or not available in web mode
      }

      setIsImporting(true);

      const result = await importMarkdownFolder(selected, {
        importTags,
        onProgress: setImportProgress,
      });
      setImportResult(result);

      // Refresh atoms and tags to show imported content
      if (result.imported > 0) {
        await Promise.all([fetchAtoms(), fetchTags()]);
      }
    } catch (e) {
      setImportError(String(e));
    } finally {
      setIsImporting(false);
    }
  };

  const [appleNotesNeedsFda, setAppleNotesNeedsFda] = useState(false);

  const handleAppleNotesImport = async () => {
    setImportResult(null);
    setImportError(null);
    setImportProgress(null);
    setAppleNotesNeedsFda(false);

    try {
      setIsImporting(true);
      const result = await importAppleNotes({
        importTags,
        onProgress: setImportProgress,
      });
      setImportResult(result);

      if (result.imported > 0) {
        await Promise.all([fetchAtoms(), fetchTags()]);
      }
    } catch (e) {
      if (e instanceof AppleNotesImportError && e.kind === 'permissionDenied') {
        setAppleNotesNeedsFda(true);
      } else if (e instanceof AppleNotesImportError && e.kind === 'notFound') {
        setImportError(
          'Apple Notes data folder not found. Open the Apple Notes app at least once, then try again.',
        );
      } else {
        setImportError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setIsImporting(false);
    }
  };

  // Get Ollama embedding models
  const ollamaEmbeddingModels: AvailableModel[] = ollamaModels
    .filter(m => m.is_embedding)
    .map(m => ({ id: m.id, name: m.name }));

  // Get Ollama LLM models
  const ollamaLlmModels: AvailableModel[] = ollamaModels
    .filter(m => !m.is_embedding)
    .map(m => ({ id: m.id, name: m.name }));

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm safe-area-padding"
    >
      <div className="relative bg-[var(--color-bg-panel)] rounded-lg shadow-xl border border-[var(--color-border)] w-[min(1120px,calc(100vw-2rem))] h-[84vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            {t('settings_title')}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] rounded transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav className="md:hidden border-b border-[var(--color-border)] bg-[var(--color-bg-main)]/35 overflow-x-auto">
            <div className="flex gap-1 p-2 min-w-max">
              {SETTINGS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-2 text-sm rounded-md transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]/70'
                  }`}
                >
                  {t(tab.labelKey)}
                </button>
              ))}
            </div>
          </nav>

          <nav className="hidden md:block w-48 flex-shrink-0 border-r border-[var(--color-border)] bg-[var(--color-bg-main)]/35 p-2 overflow-y-auto">
            <div className="space-y-1">
              {SETTINGS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full px-3 py-2 text-left text-sm rounded-md transition-colors ${
                    activeTab === tab.id
                      ? 'bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]/70'
                  }`}
                >
                  {t(tab.labelKey)}
                </button>
              ))}
            </div>
          </nav>

          {/* Content */}
          <div className="px-4 py-4 md:px-6 md:py-5 space-y-6 overflow-y-auto flex-1 min-w-0">
              {/* ===== GENERAL TAB ===== */}
              {activeTab === 'general' && (
                <>
                  {/* Language Selector */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                      {t('settings_language')}
                    </label>
                    <CustomSelect
                      value={language}
                      onChange={(v) => {
                        setLanguage(v);
                        i18n.changeLanguage(v);
                        localStorage.setItem('i18nextLng', v);
                      }}
                      options={languages.map(l => ({ value: l.code, label: l.name }))}
                    />
                  </div>

                  {/* Theme Selector */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                      {t('settings_general_theme')}
                    </label>
                    <CustomSelect
                      value={theme}
                      onChange={(v) => { setTheme(v as Theme); autoSave('theme', v); }}
                      options={THEMES}
                    />
                  </div>

                  {/* Font Selector */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                      {t('settings_general_font')}
                    </label>
                    <CustomSelect
                      value={font}
                      onChange={(v) => { setFont(v as Font); autoSave('font', v); }}
                      options={FONTS}
                    />
                  </div>

                  {/* Time Zone */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                      {t('settings_general_timezone')}
                    </label>
                    <input
                      type="text"
                      list="settings-timezones"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      onBlur={() => autoSave('timezone', timezone || getBrowserTimeZone())}
                      className="w-full px-3 py-2 rounded-md bg-[var(--color-bg-card)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                    />
                    <datalist id="settings-timezones">
                      {supportedTimeZones.map((tz) => (
                        <option key={tz} value={tz} />
                      ))}
                    </datalist>
                  </div>

                  {/* Briefing schedule + custom prompt moved onto the
                      Daily Briefing report row in phase 3. Phase 4 will
                      surface report authoring UI here; until then, the
                      schedule and prompt are editable via
                      `PUT /api/reports/:id`. */}

                  {/* Troubleshooting */}
                  <div className="space-y-2 pt-4 border-t border-[var(--color-border)]">
                    <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                      {t('settings_general_troubleshooting')}
                    </label>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {t('settings_general_export_logs_desc')}
                    </p>
                    <Button
                      onClick={async () => {
                        try {
                          const logs = await exportLogs();
                          const date = new Date().toISOString().split('T')[0];
                          const blob = new Blob([logs], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `atomic-logs-${date}.txt`;
                          a.click();
                          URL.revokeObjectURL(url);
                          toasti18n.success('settings_general_logs_exported');
                        } catch (e) {
                          toasti18n.error('settings_general_logs_export_failed', { description: String(e) });
                        }
                      }}
                      variant="secondary"
                    >
                      {t('settings_general_export_logs_button')}
                    </Button>
                  </div>
                </>
              )}

              {/* ===== AI MODELS TAB ===== */}
              {activeTab === 'ai' && (
                <>
                  {/* Provider Selector */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                      {t('settings_ai_provider')}
                    </label>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {t('settings_ai_choose_provider')}
                    </p>
                    <CustomSelect
                      value={provider}
                      onChange={(v) => handleProviderChange(v as 'openrouter' | 'ollama' | 'openai_compat')}
                      options={[
                        { value: 'openrouter', label: 'OpenRouter' },
                        { value: 'ollama', label: 'Ollama' },
                        { value: 'openai_compat', label: 'OpenAI Compatible' },
                      ]}
                    />
                    {/* Connection status — shown inline after provider */}
                    {provider === 'openrouter' && isTesting && (
                      <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                        {t('settings_ai_testing_connection')}
                      </div>
                    )}
                    {provider === 'openrouter' && !isTesting && testResult === 'success' && (
                      <div className="flex items-center gap-2 text-sm text-green-500">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        {t('settings_ai_connected')}
                      </div>
                    )}
                    {provider === 'openrouter' && !isTesting && testResult === 'error' && (
                      <div className="flex items-center gap-2 text-sm text-red-500">
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                        {testError || t('settings_ai_connection_failed')}
                      </div>
                    )}
                    <OverrideControls settingKey="provider" />
                  </div>

                  {/* OpenRouter Settings */}
                  {provider === 'openrouter' && (
                    <>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                          {t('settings_ai_openrouter_api_key')}
                        </label>
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          {t('settings_ai_openrouter_api_key_desc')}
                        </p>
                        <div className="relative">
                          <input
                            type={showApiKey ? 'text' : 'password'}
                            value={apiKey}
                            onChange={(e) => handleApiKeyChange(e.target.value)}
                            onBlur={handleApiKeyBlur}
                            placeholder={t('settings_ai_openrouter_api_key_placeholder')}
                            className="w-full px-3 py-2 pr-10 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-colors duration-150"
                          />
                          <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                          >
                            {showApiKey ? (
                              <EyeOff className="w-5 h-5" strokeWidth={2} />
                            ) : (
                              <Eye className="w-5 h-5" strokeWidth={2} />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Model Configuration for OpenRouter — always visible */}
                      <div className="space-y-4 pt-2">
                        <div className="text-sm font-medium text-[var(--color-text-primary)]">{t('settings_ai_model_configuration')}</div>
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          {t('settings_ai_select_models')}
                        </p>

                        {/* Embedding Model */}
                        <div className="space-y-1">
                          <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                            {t('settings_ai_embedding_model')}
                          </label>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {t('settings_ai_embedding_model_desc')}
                          </p>
                          <SearchableSelect
                            value={embeddingModel}
                            onChange={handleEmbeddingModelChange}
                            options={openrouterEmbeddingModels.map(m => ({
                              id: m.id,
                              name: `${m.name} (${m.dimension})`,
                            }))}
                            placeholder={t('settings_ai_embedding_model_placeholder')}
                          />
                          <OverrideControls settingKey="embedding_model" />
                        </div>

                        {/* Tagging Model */}
                        <div className="space-y-1">
                          <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                            {t('settings_ai_tagging_model')}
                          </label>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {t('settings_ai_tagging_model_desc')}
                          </p>
                          <SearchableSelect
                            value={taggingModel}
                            onChange={(v) => { setTaggingModel(v); autoSave('tagging_model', v); }}
                            options={availableModels}
                            isLoading={isLoadingModels}
                            placeholder={t('settings_ai_tagging_model_placeholder')}
                          />
                          <OverrideControls settingKey="tagging_model" />
                        </div>

                        {/* Wiki Model */}
                        <div className="space-y-1">
                          <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                            {t('settings_ai_wiki_model')}
                          </label>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {t('settings_ai_wiki_model_desc')}
                          </p>
                          <SearchableSelect
                            value={wikiModel}
                            onChange={(v) => { setWikiModel(v); autoSave('wiki_model', v); }}
                            options={availableModels}
                            isLoading={isLoadingModels}
                            placeholder={t('settings_ai_wiki_model_placeholder')}
                          />
                          <OverrideControls settingKey="wiki_model" />
                        </div>

                        {/* Wiki Strategy */}
                        <div className="space-y-1">
                          <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                            {t('settings_ai_wiki_strategy')}
                          </label>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {t('settings_ai_wiki_strategy_desc')}
                          </p>
                          <CustomSelect
                            value={wikiStrategy}
                            onChange={(v) => { setWikiStrategy(v); autoSave('wiki_strategy', v); }}
                            options={[
                              { value: 'centroid', label: t('settings_ai_wiki_strategy_centroid') },
                              { value: 'agentic', label: t('settings_ai_wiki_strategy_agentic') },
                            ]}
                          />
                          <OverrideControls settingKey="wiki_strategy" />
                        </div>

                        {/* Chat Model */}
                        <div className="space-y-1">
                          <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                            {t('settings_ai_chat_model')}
                          </label>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {t('settings_ai_chat_model_desc')}
                          </p>
                          <SearchableSelect
                            value={chatModel}
                            onChange={(v) => { setChatModel(v); autoSave('chat_model', v); }}
                            options={availableModels}
                            isLoading={isLoadingModels}
                            placeholder={t('settings_ai_chat_model_placeholder')}
                          />
                          <OverrideControls settingKey="chat_model" />
                        </div>

                        {/* Context Length */}
                        <div className="space-y-1">
                          <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                            {t('settings_ai_context_length')}
                          </label>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {t('settings_ai_context_length_desc')}
                          </p>
                          <CustomSelect
                            value={openrouterContextLength}
                            onChange={(v) => { setOpenrouterContextLength(v); autoSave('openrouter_context_length', v); }}
                            options={[
                              { value: '', label: t('settings_ai_context_length_default') },
                              { value: '8192', label: '8K' },
                              { value: '16384', label: '16K' },
                              { value: '32768', label: '32K' },
                              { value: '65536', label: '64K' },
                              { value: '131072', label: '128K' },
                              { value: '262144', label: '256K' },
                              { value: '1000000', label: '1M' },
                            ]}
                          />
                          <OverrideControls settingKey="openrouter_context_length" />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Ollama Settings */}
                  {provider === 'ollama' && (
                    <>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                          {t('settings_ai_ollama_server_url')}
                        </label>
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          {t('settings_ai_ollama_server_url_desc')}
                        </p>
                        <input
                          type="text"
                          value={ollamaHost}
                          onChange={(e) => setOllamaHost(e.target.value)}
                          onBlur={() => autoSave('ollama_host', ollamaHost)}
                          placeholder={t('settings_ai_ollama_server_url_placeholder')}
                          className="w-full px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-colors duration-150"
                        />
                        <ConnectionStatus status={ollamaStatus} error={ollamaError} />
                      </div>

                      {ollamaStatus === 'connected' && (
                        <div className="space-y-4">
                          {/* Ollama Embedding Model */}
                          <div className="space-y-1">
                            <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                              {t('settings_ai_ollama_embedding_model')}
                            </label>
                            <p className="text-xs text-[var(--color-text-secondary)]">
                              {t('settings_ai_ollama_embedding_model_desc')}
                            </p>
                            {ollamaEmbeddingModels.length > 0 ? (
                              <SearchableSelect
                                value={ollamaEmbeddingModel}
                                onChange={handleOllamaEmbeddingModelChange}
                                options={ollamaEmbeddingModels}
                                isLoading={isLoadingOllamaModels}
                                placeholder={t('settings_ai_ollama_embedding_model_placeholder')}
                              />
                            ) : (
                              <div className="px-3 py-2 bg-[var(--color-bg-card)] border border-amber-500/50 rounded-md text-sm text-amber-400">
                                {t('settings_ai_ollama_embedding_model_not_found')}
                              </div>
                            )}
                            <OverrideControls settingKey="ollama_embedding_model" />
                          </div>

                          {/* Ollama LLM Model */}
                          <div className="space-y-1">
                            <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                              {t('settings_ai_ollama_llm_model')}
                            </label>
                            <p className="text-xs text-[var(--color-text-secondary)]">
                              {t('settings_ai_ollama_llm_model_desc')}
                            </p>
                            {ollamaLlmModels.length > 0 ? (
                              <SearchableSelect
                                value={ollamaLlmModel}
                                onChange={(v) => { setOllamaLlmModel(v); autoSave('ollama_llm_model', v); }}
                                options={ollamaLlmModels}
                                isLoading={isLoadingOllamaModels}
                                placeholder={t('settings_ai_ollama_llm_model_placeholder')}
                              />
                            ) : (
                              <div className="px-3 py-2 bg-[var(--color-bg-card)] border border-amber-500/50 rounded-md text-sm text-amber-400">
                                {t('settings_ai_ollama_llm_model_not_found')}
                              </div>
                            )}
                            <OverrideControls settingKey="ollama_llm_model" />
                          </div>

                          {/* Context Length */}
                          <div className="space-y-1">
                            <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                              {t('settings_ai_ollama_context_length')}
                            </label>
                            <p className="text-xs text-[var(--color-text-secondary)]">
                              {t('settings_ai_ollama_context_length_desc')}
                            </p>
                            <CustomSelect
                              value={ollamaContextLength}
                              onChange={(v) => { setOllamaContextLength(v); autoSave('ollama_context_length', v); }}
                              options={[
                                { value: '2048', label: '2K' },
                                { value: '4096', label: '4K' },
                                { value: '8192', label: '8K' },
                                { value: '16384', label: '16K' },
                                { value: '32768', label: '32K' },
                                { value: '65536', label: '64K' },
                                { value: '131072', label: '128K' },
                                { value: '262144', label: '256K' },
                                { value: '1000000', label: '1M' },
                              ]}
                            />
                            <OverrideControls settingKey="ollama_context_length" />
                          </div>

                          {/* Timeout */}
                          <div className="space-y-1">
                            <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                              {t('settings_ai_ollama_request_timeout')}
                            </label>
                            <p className="text-xs text-[var(--color-text-secondary)]">
                              {t('settings_ai_ollama_request_timeout_desc')}
                            </p>
                            <CustomSelect
                              value={ollamaTimeoutSecs}
                              onChange={(v) => { setOllamaTimeoutSecs(v); autoSave('ollama_timeout_secs', v); }}
                              options={[
                                { value: '30', label: '30 seconds' },
                                { value: '60', label: '60 seconds' },
                                { value: '120', label: '2 minutes' },
                                { value: '180', label: '3 minutes' },
                                { value: '300', label: '5 minutes' },
                                { value: '600', label: '10 minutes' },
                              ]}
                            />
                            <OverrideControls settingKey="ollama_timeout_secs" />
                          </div>
                        </div>
                      )}

                      {ollamaStatus === 'disconnected' && (
                        <div className="p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md space-y-2">
                          <p className="text-sm text-[var(--color-text-primary)]">{t('settings_ai_ollama_disconnected')}</p>
                          <ol className="text-xs text-[var(--color-text-secondary)] space-y-1 list-decimal list-inside">
                            <li>{t('settings_ai_ollama_disconnected_step1')}</li>
                            <li>{t('settings_ai_ollama_disconnected_step2')}</li>
                            <li>{t('settings_ai_ollama_disconnected_step3')}</li>
                          </ol>
                          <Button
                            variant="secondary"
                            onClick={() => checkOllamaConnection(ollamaHost)}
                            className="mt-2"
                          >
                            {t('settings_ai_ollama_retry_connection')}
                          </Button>
                        </div>
                      )}
                    </>
                  )}

                  {/* OpenAI Compatible Settings */}
                  {provider === 'openai_compat' && (
                    <>
                      {/* Embedding Provider Override — use a different provider for embeddings */}
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                          {t('settings_ai_embedding_provider')}
                        </label>
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          {t('settings_ai_embedding_provider_desc')}
                        </p>
                        <CustomSelect
                          value={embeddingProvider}
                          onChange={(v) => {
                            const val = v as 'openrouter' | 'ollama' | 'openai_compat' | '';
                            setEmbeddingProvider(val);
                            autoSave('embedding_provider', val);
                          }}
                          options={[
                            { value: '', label: t('settings_ai_embedding_provider_same') },
                            { value: 'ollama', label: 'Ollama' },
                            { value: 'openai_compat', label: 'OpenAI Compatible' },
                          ]}
                        />
                      </div>

                      {/* Ollama host for embedding — shown when Ollama is selected as embedding provider */}
                      {embeddingProvider === 'ollama' && (
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                            {t('settings_ai_ollama_host_embedding')}
                          </label>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {t('settings_ai_ollama_host_embedding_desc')}
                          </p>
                          <input
                            type="text"
                            value={ollamaHost}
                            onChange={(e) => setOllamaHost(e.target.value)}
                            onBlur={() => autoSave('ollama_host', ollamaHost)}
                            placeholder={t('settings_ai_ollama_server_url_placeholder')}
                            className="w-full px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-colors duration-150"
                          />
                        </div>
                      )}

                      {/* OpenAI-Compatible URL for embedding — shown when OpenAI-Compatible is selected as embedding provider */}
                      {embeddingProvider === 'openai_compat' && (
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                            {t('settings_ai_embedding_provider_url')}
                          </label>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {t('settings_ai_embedding_provider_url_desc')}
                          </p>
                          <input
                            type="text"
                            value={embeddingProviderUrl}
                            onChange={(e) => setEmbeddingProviderUrl(e.target.value)}
                            onBlur={() => autoSave('embedding_provider_url', embeddingProviderUrl)}
                            placeholder={t('settings_ai_embedding_provider_url_placeholder')}
                            className="w-full px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-colors duration-150"
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                          {t('settings_ai_base_url')}
                        </label>
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          {t('settings_ai_base_url_desc')}
                        </p>
                        <input
                          type="text"
                          value={openaiCompatBaseUrl}
                          onChange={(e) => setOpenaiCompatBaseUrl(e.target.value)}
                          onBlur={() => {
                            autoSave('openai_compat_base_url', openaiCompatBaseUrl);
                            if (openaiCompatBaseUrl.trim()) {
                              checkOpenaiCompatConnection(openaiCompatBaseUrl, openaiCompatApiKey || undefined);
                            }
                          }}
                          placeholder={t('settings_ai_base_url_placeholder')}
                          className="w-full px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-colors duration-150"
                        />
                        {openaiCompatStatus === 'checking' && (
                          <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                            {t('settings_ai_testing_connection')}
                          </div>
                        )}
                        {openaiCompatStatus === 'connected' && (
                          <div className="flex items-center gap-2 text-sm text-green-500">
                            <div className="w-2 h-2 rounded-full bg-green-500" />
                            {t('settings_ai_connected')}
                          </div>
                        )}
                        {openaiCompatStatus === 'error' && (
                          <div className="flex items-center gap-2 text-sm text-red-500">
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                            {openaiCompatError || t('settings_ai_connection_failed')}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                          {t('settings_ai_api_key')}
                        </label>
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          {t('settings_ai_api_key_desc')}
                        </p>
                        <div className="relative">
                          <input
                            type={openaiCompatShowApiKey ? 'text' : 'password'}
                            value={openaiCompatApiKey}
                            onChange={(e) => setOpenaiCompatApiKey(e.target.value)}
                            onBlur={() => autoSave('openai_compat_api_key', openaiCompatApiKey)}
                            placeholder={t('settings_ai_api_key_placeholder')}
                            className="w-full px-3 py-2 pr-10 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-colors duration-150"
                          />
                          <button
                            type="button"
                            onClick={() => setOpenaiCompatShowApiKey(!openaiCompatShowApiKey)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                          >
                            {openaiCompatShowApiKey ? (
                              <EyeOff className="w-5 h-5" strokeWidth={2} />
                            ) : (
                              <Eye className="w-5 h-5" strokeWidth={2} />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-4 pt-2">
                        <div className="text-sm font-medium text-[var(--color-text-primary)]">{t('settings_ai_model_configuration_openai')}</div>
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          {t('settings_ai_model_configuration_openai_desc')}
                        </p>

                        {/* Embedding Model */}
                        <div className="space-y-1">
                          <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                            {t('settings_ai_embedding_model_openai')}
                          </label>
                          <input
                            type="text"
                            value={openaiCompatEmbeddingModel}
                            onChange={(e) => setOpenaiCompatEmbeddingModel(e.target.value)}
                            onBlur={() => {
                              if (openaiCompatEmbeddingModel !== (settings.openai_compat_embedding_model || '')) {
                                handleOpenaiCompatEmbeddingModelChange(openaiCompatEmbeddingModel);
                              }
                            }}
                            placeholder={t('settings_ai_embedding_model_openai_placeholder')}
                            className="w-full px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-colors duration-150"
                          />
                          <OverrideControls settingKey="openai_compat_embedding_model" />
                        </div>

                        {/* Embedding Dimension */}
                        <div className="space-y-1">
                          <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                            {t('settings_ai_embedding_dimension')}
                          </label>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {t('settings_ai_embedding_dimension_desc')}
                          </p>
                          <input
                            type="number"
                            value={openaiCompatEmbeddingDimension}
                            onChange={(e) => setOpenaiCompatEmbeddingDimension(e.target.value)}
                            onBlur={() => {
                              if (openaiCompatEmbeddingDimension !== (settings.openai_compat_embedding_dimension || '1536')) {
                                handleOpenaiCompatEmbeddingDimensionChange(openaiCompatEmbeddingDimension);
                              }
                            }}
                            placeholder={t('settings_ai_embedding_dimension_placeholder')}
                            className="w-full px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-colors duration-150"
                          />
                          <OverrideControls settingKey="openai_compat_embedding_dimension" />
                        </div>

                        {/* LLM Model */}
                        <div className="space-y-1">
                          <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                            {t('settings_ai_llm_model_openai')}
                          </label>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {t('settings_ai_llm_model_openai_desc')}
                          </p>
                          <input
                            type="text"
                            value={openaiCompatLlmModel}
                            onChange={(e) => setOpenaiCompatLlmModel(e.target.value)}
                            onBlur={() => autoSave('openai_compat_llm_model', openaiCompatLlmModel)}
                            placeholder={t('settings_ai_llm_model_openai_placeholder')}
                            className="w-full px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-colors duration-150"
                          />
                          <OverrideControls settingKey="openai_compat_llm_model" />
                        </div>

                        {/* Context Length */}
                        <div className="space-y-1">
                          <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                            {t('settings_ai_context_length_openai')}
                          </label>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {t('settings_ai_context_length_openai_desc')}
                          </p>
                          <CustomSelect
                            value={openaiCompatContextLength}
                            onChange={(v) => { setOpenaiCompatContextLength(v); autoSave('openai_compat_context_length', v); }}
                            options={[
                              { value: '2048', label: '2K' },
                              { value: '4096', label: '4K' },
                              { value: '8192', label: '8K' },
                              { value: '16384', label: '16K' },
                              { value: '32768', label: '32K' },
                              { value: '65536', label: '64K' },
                              { value: '131072', label: '128K' },
                              { value: '262144', label: '256K' },
                              { value: '1000000', label: '1M' },
                            ]}
                          />
                          <OverrideControls settingKey="openai_compat_context_length" />
                        </div>

                        {/* Timeout */}
                        <div className="space-y-1">
                          <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                            {t('settings_ai_request_timeout_openai')}
                          </label>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {t('settings_ai_request_timeout_openai_desc')}
                          </p>
                          <CustomSelect
                            value={openaiCompatTimeoutSecs}
                            onChange={(v) => { setOpenaiCompatTimeoutSecs(v); autoSave('openai_compat_timeout_secs', v); }}
                            options={[
                              { value: '30', label: '30 seconds' },
                              { value: '60', label: '60 seconds' },
                              { value: '120', label: '2 minutes' },
                              { value: '180', label: '3 minutes' },
                              { value: '300', label: '5 minutes' },
                              { value: '600', label: '10 minutes' },
                            ]}
                          />
                          <OverrideControls settingKey="openai_compat_timeout_secs" />
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}


              {/* ===== PROMPTS TAB ===== */}
              {activeTab === 'prompts' && (
                <div className="space-y-6">

                  {/* Wiki Generation Prompt */}
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                      {t('settings_prompts_wiki_generation_label')}
                    </label>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {t('settings_prompts_wiki_generation_desc')}
                    </p>
                    <textarea
                      value={wikiGenerationPrompt}
                      onChange={(e) => setWikiGenerationPrompt(e.target.value)}
                      onBlur={() => autoSave('wiki_generation_prompt', wikiGenerationPrompt)}
                      placeholder={"You are synthesizing a wiki article based on the user's personal knowledge base. Write a well-structured, informative article that summarizes what is known about the topic.\n\nGuidelines:\n- Use markdown formatting with ## for main sections and ### for subsections\n- Every factual claim MUST have a citation using [N] notation\n- Place citations immediately after the relevant statement\n- If sources contain contradictions, note them\n- Structure logically: overview first, then thematic sections\n- Keep tone informative and neutral\n- Do not invent information not present in the sources\n- When mentioning topics that have their own articles in the knowledge base, use [[Topic Name]] wiki-link notation to cross-reference them\n- Only use [[wiki links]] for topics listed in the EXISTING WIKI ARTICLES section provided\n- Do not force wiki links where they don't fit naturally"}
                      rows={8}
                      className="w-full px-3 py-2 rounded-md bg-[var(--color-bg-main)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] font-mono resize-y placeholder:text-[var(--color-text-secondary)]/40"
                    />
                    {wikiGenerationPrompt && (
                      <button
                        onClick={() => { setWikiGenerationPrompt(''); autoSave('wiki_generation_prompt', ''); }}
                        className="text-xs text-[var(--color-accent)] hover:underline"
                      >
                        {t('settings_prompts_wiki_generation_reset')}
                      </button>
                    )}
                    <OverrideControls settingKey="wiki_generation_prompt" />
                  </div>

                  {/* Wiki Update Prompt */}
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                      {t('settings_prompts_wiki_update_label')}
                    </label>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {t('settings_prompts_wiki_update_desc')}
                    </p>
                    <textarea
                      value={wikiUpdatePrompt}
                      onChange={(e) => setWikiUpdatePrompt(e.target.value)}
                      onBlur={() => autoSave('wiki_update_prompt', wikiUpdatePrompt)}
                      placeholder={"e.g. Write in a casual, conversational tone. Focus on practical implications rather than theory."}
                      rows={4}
                      className="w-full px-3 py-2 rounded-md bg-[var(--color-bg-main)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] font-mono resize-y placeholder:text-[var(--color-text-secondary)]/40"
                    />
                    {wikiUpdatePrompt && (
                      <button
                        onClick={() => { setWikiUpdatePrompt(''); autoSave('wiki_update_prompt', ''); }}
                        className="text-xs text-[var(--color-accent)] hover:underline"
                      >
                        {t('settings_prompts_wiki_update_reset')}
                      </button>
                    )}
                    <OverrideControls settingKey="wiki_update_prompt" />
                  </div>

                  {/* Briefing prompt moved to the Daily Briefing report's
                      `research_prompt` field in phase 3. Edit via the
                      reports API (`PUT /api/reports/:id`) until the
                      report-authoring UI ships in phase 4. */}

                  {/* Chat Prompt */}
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                      {t('settings_prompts_chat_label')}
                    </label>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {t('settings_prompts_chat_desc')}
                    </p>
                    <textarea
                      value={chatPrompt}
                      onChange={(e) => setChatPrompt(e.target.value)}
                      onBlur={() => autoSave('chat_prompt', chatPrompt)}
                      placeholder={"You are a helpful AI assistant with access to the user's personal knowledge base.\n\nGuidelines:\n- Use search_atoms to find relevant information before answering\n- Cite sources using [N] notation\n- Be honest if you cannot find information\n- Keep responses concise but informative"}
                      rows={6}
                      className="w-full px-3 py-2 rounded-md bg-[var(--color-bg-main)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] font-mono resize-y placeholder:text-[var(--color-text-secondary)]/40"
                    />
                    {chatPrompt && (
                      <button
                        onClick={() => { setChatPrompt(''); autoSave('chat_prompt', ''); }}
                        className="text-xs text-[var(--color-accent)] hover:underline"
                      >
                        {t('settings_prompts_chat_reset')}
                      </button>
                    )}
                    <OverrideControls settingKey="chat_prompt" />
                  </div>

                  {/* Diary Feature */}
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)]">
                      <input
                        type="checkbox"
                        checked={diaryEnabled}
                        onChange={(e) => {
                          setDiaryEnabled(e.target.checked);
                          autoSave('diary_enabled', e.target.checked ? 'true' : 'false');
                        }}
                        className="w-4 h-4 rounded border-[var(--color-border)]"
                      />
                      {t('settings_diary_enabled_label') || '日记功能'}
                    </label>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {t('settings_diary_enabled_desc') || '启用后，在聊天中输入"日记记录"会自动按模板创建日记原子'}
                    </p>
                  </div>

                  {/* Diary Template */}
                  {diaryEnabled && (
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                        {t('settings_diary_template_label') || '日记模板'}
                      </label>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {t('settings_diary_template_desc') || '使用 {date}、{time}、{location}、{weather}、{mood}、{summary}、{plan} 作为占位符'}
                      </p>
                      <textarea
                        value={diaryTemplate}
                        onChange={(e) => setDiaryTemplate(e.target.value)}
                        onBlur={() => autoSave('diary_template', diaryTemplate)}
                        placeholder={"# 日记 - {date} {time}\n\n## 位置\n📍 {location}\n\n## 天气\n🌤️ {weather}\n\n## 心情\n{mood}\n\n## 今日总结\n{summary}\n\n## 明日计划\n{plan}"}
                        rows={10}
                        className="w-full px-3 py-2 rounded-md bg-[var(--color-bg-main)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] font-mono resize-y placeholder:text-[var(--color-text-secondary)]/40"
                      />
                      {diaryTemplate && (
                        <button
                          onClick={() => { setDiaryTemplate(''); autoSave('diary_template', ''); }}
                          className="text-xs text-[var(--color-accent)] hover:underline"
                        >
                          {t('settings_diary_template_reset') || '重置为默认'}
                        </button>
                      )}
                      <OverrideControls settingKey="diary_template" />
                    </div>
                  )}

                  {/* Tagging Prompt */}
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                      {t('settings_prompts_tagging_label')}
                    </label>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {t('settings_prompts_tagging_desc')}
                    </p>
                    <textarea
                      value={taggingPrompt}
                      onChange={(e) => setTaggingPrompt(e.target.value)}
                      onBlur={() => autoSave('tagging_prompt', taggingPrompt)}
                      placeholder={"You are a knowledge management assistant that categorizes text with tags.\n\nGuidelines:\n- Each tag MUST have a parent_name set to one of the existing top-level categories\n- Prefer broad tags rather than overly specific ones\n- If none of the categories feel like a natural fit, return an empty tag list"}
                      rows={4}
                      className="w-full px-3 py-2 rounded-md bg-[var(--color-bg-main)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] font-mono resize-y placeholder:text-[var(--color-text-secondary)]/40"
                    />
                    {taggingPrompt && (
                      <button
                        onClick={() => { setTaggingPrompt(''); autoSave('tagging_prompt', ''); }}
                        className="text-xs text-[var(--color-accent)] hover:underline"
                      >
                        {t('settings_prompts_tagging_reset')}
                      </button>
                    )}
                    <OverrideControls settingKey="tagging_prompt" />
                  </div>

                </div>
              )}
              {/* ===== TAG CATEGORIES TAB ===== */}
              {activeTab === 'tag-categories' && (
                <>
                  {/* Auto-tagging master toggle — gates everything below;
                      tag categories only matter when this is on. */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                          {t('settings_automatic_tag_extraction')}
                        </label>
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          {t('settings_automatic_tag_extraction_desc')}
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={autoTaggingEnabled}
                        onClick={() => { const next = !autoTaggingEnabled; setAutoTaggingEnabled(next); autoSave('auto_tagging_enabled', next ? 'true' : 'false'); }}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[var(--color-bg-panel)] ${
                          autoTaggingEnabled ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-bg-hover)]'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            autoTaggingEnabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                    <OverrideControls settingKey="auto_tagging_enabled" />
                  </div>

                  <TagCategoriesTab />
                </>
              )}

              {/* ===== CONNECTION TAB ===== */}
              {activeTab === 'connection' && (
                <>
                  {/* Connect to Server Section — desktop + local server */}
                  {isDesktopApp() && isLocalServer() && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                            {t('settings_connection_server')}
                          </label>
                          <p className="text-xs text-green-500 flex items-center gap-1.5">
                            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                            {t('settings_connection_local')}
                          </p>
                        </div>
                        <Button variant="secondary" onClick={() => setShowChangeServer(!showChangeServer)}>
                          {showChangeServer ? t('settings_connection_cancel') : t('settings_connection_connect_to_custom')}
                        </Button>
                      </div>
                      {localServerConfig && (
                        <div className="space-y-2 pt-2">
                          <div className="space-y-1">
                            <label className="block text-xs font-medium text-[var(--color-text-secondary)]">
                              {t('settings_connection_local_server_url')}
                            </label>
                            <div className="flex gap-2">
                              <code className="flex-1 px-3 py-2 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-md text-xs text-[var(--color-text-primary)] truncate">
                                {localServerConfig.baseUrl}
                              </code>
                              <Button variant="secondary" size="sm" onClick={handleCopyLocalUrl}>
                                {localUrlCopied ? t('common_success') : t('common_copy')}
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-xs font-medium text-[var(--color-text-secondary)]">
                              {t('settings_connection_local_api_token')}
                            </label>
                            <div className="flex gap-2">
                              <code className="flex-1 px-3 py-2 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-md text-xs text-[var(--color-text-primary)] truncate">
                                {localServerConfig.authToken ? `${localServerConfig.authToken.substring(0, 12)}...` : 'N/A'}
                              </code>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleCopyLocalToken}
                                disabled={!localServerConfig.authToken}
                              >
                                {localTokenCopied ? t('common_success') : t('common_copy')}
                              </Button>
                            </div>
                          </div>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {t('settings_connection_obsidian_integration')}
                          </p>
                        </div>
                      )}
                      {showChangeServer && (
                        <div className="space-y-3 pt-2">
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {t('settings_connection_connect_remote')}
                          </p>
                          <input
                            type="text"
                            value={serverUrl}
                            onChange={(e) => { setServerUrl(e.target.value); setServerTestResult(null); }}
                            placeholder={t('settings_connection_url_placeholder')}
                            className="w-full px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-colors duration-150 text-sm"
                          />
                          <input
                            type="password"
                            value={serverToken}
                            onChange={(e) => { setServerToken(e.target.value); setServerTestResult(null); }}
                            placeholder={t('settings_connection_token_placeholder')}
                            className="w-full px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-colors duration-150 text-sm"
                          />
                          <div className="flex gap-2">
                            <Button variant="secondary" onClick={handleTestServer} disabled={!serverUrl.trim() || !serverToken.trim() || isTestingServer}>
                              {isTestingServer ? t('settings_connection_testing') : t('settings_connection_test')}
                            </Button>
                            <Button onClick={handleConnectServer} disabled={serverTestResult !== 'success'}>
                              {t('settings_connection_connect')}
                            </Button>
                          </div>
                          {serverTestResult === 'success' && (
                            <div className="text-sm text-green-500">{t('settings_connection_reachable')}</div>
                          )}
                          {serverTestResult === 'error' && (
                            <div className="text-sm text-red-500">{serverTestError}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Connected to remote — show status with change/disconnect options */}
                  {isRemoteMode && getTransport().isConnected() && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                            {t('settings_connection_remote_server')}
                          </label>
                          <p className="text-xs text-green-500 flex items-center gap-1.5">
                            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                            {t('settings_connection_connected_to', { url: serverUrl })}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="secondary" onClick={() => setShowChangeServer(!showChangeServer)}>
                            {showChangeServer ? t('settings_connection_cancel') : t('settings_connection_change')}
                          </Button>
                          {isDesktopApp() ? (
                            <Button variant="secondary" onClick={handleDisconnectServer}>
                              {t('settings_connection_switch_to_local')}
                            </Button>
                          ) : (
                            <Button variant="secondary" onClick={() => {
                              localStorage.removeItem('atomic-server-config');
                              window.location.reload();
                            }}>
                              {t('settings_connection_log_out')}
                            </Button>
                          )}
                        </div>
                      </div>
                      {showChangeServer && (
                        <div className="space-y-3 pt-2">
                          <input
                            type="text"
                            value={serverUrl}
                            onChange={(e) => { setServerUrl(e.target.value); setServerTestResult(null); }}
                            placeholder={t('settings_connection_url_placeholder')}
                            className="w-full px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-colors duration-150 text-sm"
                          />
                          <input
                            type="password"
                            value={serverToken}
                            onChange={(e) => { setServerToken(e.target.value); setServerTestResult(null); }}
                            placeholder={t('settings_connection_token_placeholder')}
                            className="w-full px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-colors duration-150 text-sm"
                          />
                          <div className="flex gap-2">
                            <Button variant="secondary" onClick={handleTestServer} disabled={!serverUrl.trim() || !serverToken.trim() || isTestingServer}>
                              {isTestingServer ? t('settings_connection_testing') : t('settings_connection_test')}
                            </Button>
                            <Button onClick={handleConnectServer} disabled={serverTestResult !== 'success'}>
                              {t('settings_connection_reconnect')}
                            </Button>
                          </div>
                          {serverTestResult === 'success' && (
                            <div className="text-sm text-green-500">{t('settings_connection_reachable')}</div>
                          )}
                          {serverTestResult === 'error' && (
                            <div className="text-sm text-red-500">{serverTestError}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* API Tokens Section — remote/web only (auto-managed for local sidecar) */}
                  {!isLocalServer() && getTransport().isConnected() && (
                    <div className="space-y-3 pt-4 border-t border-[var(--color-border)]">
                      <button
                        type="button"
                        onClick={() => setShowTokenSection(!showTokenSection)}
                        className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)] hover:text-white transition-colors w-full"
                      >
                        <ChevronRight
                          className={`w-4 h-4 transition-transform ${showTokenSection ? 'rotate-90' : ''}`}
                          strokeWidth={2}
                        />
                        {t('settings_connection_api_tokens')}
                        {apiTokens.filter(t => !t.is_revoked).length > 0 && (
                          <span className="text-xs text-[var(--color-text-secondary)]">
                            ({t('settings_connection_active_count', { count: apiTokens.filter(t => !t.is_revoked).length })})
                          </span>
                        )}
                      </button>

                      {showTokenSection && (
                        <div className="space-y-4 pl-6 border-l-2 border-[var(--color-border)]">
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {t('settings_connection_manage_tokens')}
                          </p>

                          {/* Token list */}
                          {isLoadingTokens ? (
                            <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                              {t('settings_connection_loading_tokens')}
                            </div>
                          ) : apiTokens.length === 0 ? (
                            <div className="text-sm text-[var(--color-text-secondary)]">{t('settings_connection_no_tokens')}</div>
                          ) : (
                            <div className="space-y-2">
                              {apiTokens.filter(t => !t.is_revoked).map((token) => {
                                const isCurrentToken = token.token_prefix === serverToken.substring(0, 10);
                                return (
                                  <div
                                    key={token.id}
                                    className={`p-3 bg-[var(--color-bg-card)] border rounded-md text-sm ${
                                      isCurrentToken ? 'border-green-500/50' : 'border-[var(--color-border)]'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-[var(--color-text-primary)]">{token.name}</span>
                                        {isCurrentToken && (
                                          <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">{t('settings_connection_current')}</span>
                                        )}
                                      </div>
                                      {confirmRevokeId === token.id ? (
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-amber-400">
                                            {isCurrentToken ? t('settings_connection_this_will_log_out') : t('settings_connection_revoke_question')}
                                          </span>
                                          <button
                                            onClick={() => handleRevokeToken(token.id)}
                                            className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                                          >
                                            {t('settings_connection_confirm')}
                                          </button>
                                          <button
                                            onClick={() => setConfirmRevokeId(null)}
                                            className="text-xs px-2 py-1 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                                          >
                                            {t('settings_connection_cancel')}
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => setConfirmRevokeId(token.id)}
                                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                                        >
                                          {t('settings_connection_revoke')}
                                        </button>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-[var(--color-text-secondary)]">
                                      <span className="font-mono">{token.token_prefix}...</span>
                                      <span>{t('settings_connection_created', { date: new Date(token.created_at).toLocaleDateString() })}</span>
                                      {token.last_used_at && (
                                        <span>{t('settings_connection_last_used', { date: new Date(token.last_used_at).toLocaleDateString() })}</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Created token display (shown once after creation) */}
                          {createdToken && (
                            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-md space-y-2">
                              <div className="text-sm font-medium text-amber-400">
                                {t('settings_connection_token_created_save')}
                              </div>
                              <div className="flex items-center gap-2">
                                <code className="flex-1 text-xs font-mono bg-[var(--color-bg-main)] px-2 py-1.5 rounded border border-[var(--color-border)] text-[var(--color-text-primary)] break-all select-all">
                                  {createdToken.token}
                                </code>
                                <button
                                  onClick={handleCopyToken}
                                  className="p-1.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors flex-shrink-0"
                                  title={t('settings_connection_copy_clipboard')}
                                >
                                  {tokenCopied ? (
                                    <Check className="w-4 h-4 text-green-500" strokeWidth={2} />
                                  ) : (
                                    <Copy className="w-4 h-4" strokeWidth={2} />
                                  )}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Create new token */}
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newTokenName}
                              onChange={(e) => setNewTokenName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateToken(); }}
                              placeholder={t('settings_connection_token_name_placeholder')}
                              className="flex-1 px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-colors duration-150 text-sm"
                            />
                            <Button
                              variant="secondary"
                              onClick={handleCreateToken}
                              disabled={!newTokenName.trim() || isCreatingToken}
                            >
                              {isCreatingToken ? t('settings_connection_creating') : t('settings_connection_create')}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </>
              )}

              {/* ===== INTEGRATIONS TAB ===== */}
              {activeTab === 'integrations' && (
                <>
                  {/* Ingest URL Section */}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                        {t('settings_integrations_ingest_url')}
                      </label>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {t('settings_integrations_ingest_url_desc')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={ingestUrlValue}
                        onChange={(e) => { setIngestUrlValue(e.target.value); setIngestResult(null); setIngestError(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleIngestUrl(); }}
                        placeholder={t('settings_integrations_ingest_url_placeholder')}
                        className="flex-1 px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-colors duration-150 text-sm"
                      />
                      <Button onClick={handleIngestUrl} disabled={!ingestUrlValue.trim() || ingesting}>
                        {ingesting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-1" strokeWidth={2} />
                            {t('settings_integrations_ingesting')}
                          </>
                        ) : t('settings_integrations_ingest')}
                      </Button>
                    </div>

                    {ingestResult && (
                      <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-md text-sm">
                        <div className="text-green-400 font-medium mb-1">{t('settings_integrations_added_to_kb')}</div>
                        <div className="text-[var(--color-text-secondary)]">{ingestResult.title}</div>
                      </div>
                    )}

                    {ingestError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-md text-sm">
                        <div className="text-red-400 font-medium mb-1">{t('settings_integrations_ingestion_failed')}</div>
                        <div className="text-[var(--color-text-secondary)]">{ingestError}</div>
                      </div>
                    )}
                  </div>

                  {/* RSS Feeds Section */}
                  <div className="space-y-3 pt-4 border-t border-[var(--color-border)]">
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                        {t('settings_integrations_rss_feeds')}
                      </label>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {t('settings_integrations_rss_feeds_desc')}
                      </p>
                    </div>

                    {/* Poll result banner */}
                    {pollResult && (
                      <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-md text-sm">
                        <div className="text-green-400 font-medium mb-1">{t('settings_integrations_poll_complete')}</div>
                        <div className="text-[var(--color-text-secondary)]">
                          {t('settings_integrations_new_items', { count: pollResult.new_items })}
                          {pollResult.skipped > 0 && `, ${t('settings_integrations_skipped', { count: pollResult.skipped })}`}
                          {pollResult.errors > 0 && `, ${t('settings_integrations_errors', { count: pollResult.errors })}`}
                        </div>
                      </div>
                    )}

                    {feedError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-md text-sm">
                        <div className="text-red-400 font-medium mb-1">{t('settings_integrations_error')}</div>
                        <div className="text-[var(--color-text-secondary)]">{feedError}</div>
                      </div>
                    )}

                    {/* Feed list */}
                    {feedsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] py-4">
                        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                        {t('settings_integrations_loading_feeds')}
                      </div>
                    ) : feeds.length === 0 ? (
                      <div className="text-sm text-[var(--color-text-secondary)] py-4">
                        {t('settings_integrations_no_feeds')}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {feeds.map((feed) => (
                          <div
                            key={feed.id}
                            className="p-3 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                                    {feed.title || feed.url}
                                  </span>
                                  {feed.is_paused && (
                                    <span className="px-1.5 py-0.5 text-xs rounded bg-yellow-500/20 text-yellow-400">
                                      {t('common_paused')}
                                    </span>
                                  )}
                                </div>
                                {feed.title && (
                                  <div className="text-xs text-[var(--color-text-secondary)] truncate mt-0.5">
                                    {feed.url}
                                  </div>
                                )}
                                <div className="text-xs text-[var(--color-text-secondary)] mt-1">
                                  Every {feed.poll_interval}m
                                  {feed.last_polled_at && (
                                    <> · Polled {formatRelativeDate(feed.last_polled_at)}</>
                                  )}
                                </div>
                                {feed.last_error && (
                                  <div className="text-xs text-red-400 mt-1 truncate" title={feed.last_error}>
                                    {feed.last_error}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handlePollFeed(feed.id)}
                                  disabled={pollingFeedId === feed.id}
                                  className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] rounded transition-colors disabled:opacity-50"
                                  title={t('common_poll_now')}
                                >
                                  {pollingFeedId === feed.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                                  ) : (
                                    <RefreshCw className="w-4 h-4" strokeWidth={2} />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleFeedPause(feed)}
                                  className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] rounded transition-colors"
                                  title={feed.is_paused ? t('common_resume') : t('common_pause')}
                                >
                                  {feed.is_paused ? (
                                    <Play className="w-4 h-4" strokeWidth={2} />
                                  ) : (
                                    <Pause className="w-4 h-4" strokeWidth={2} />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteFeed(feed.id)}
                                  disabled={deletingFeedId === feed.id}
                                  className="p-1.5 text-[var(--color-text-secondary)] hover:text-red-400 hover:bg-[var(--color-bg-hover)] rounded transition-colors disabled:opacity-50"
                                  title={t('common_delete')}
                                >
                                  <Trash2 className="w-4 h-4" strokeWidth={2} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add feed form */}
                    <div className="flex gap-2 pt-2">
                      <input
                        type="url"
                        value={newFeedUrl}
                        onChange={(e) => { setNewFeedUrl(e.target.value); setFeedError(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddFeed(); }}
                        placeholder={t('settings_integrations_add_feed_url')}
                        className="flex-1 px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-colors duration-150 text-sm"
                      />
                      <Button variant="secondary" onClick={handleAddFeed} disabled={!newFeedUrl.trim() || addingFeed}>
                        {addingFeed ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-1" strokeWidth={2} />
                            {t('common_adding')}
                          </>
                        ) : t('common_add')}
                      </Button>
                    </div>
                  </div>

                  {/* Feishu Integration */}
                  <div className="space-y-4 pt-4 border-t border-[var(--color-border)]">
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                        {t('settings_integrations_feishu')}
                      </label>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {t('settings_integrations_feishu_desc')}
                      </p>
                    </div>

                    {/* Feishu App ID */}
                    <div className="space-y-1">
                      <label className="block text-sm text-[var(--color-text-secondary)]">
                        {t('settings_integrations_feishu_app_id')}
                      </label>
                      <input
                        type="text"
                        value={feishuAppId}
                        onChange={(e) => setFeishuAppId(e.target.value)}
                        onBlur={() => autoSave('feishu_app_id', feishuAppId)}
                        placeholder={t('settings_integrations_feishu_app_id_placeholder')}
                        className="w-full px-3 py-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-colors duration-150"
                      />
                    </div>

                    {/* Feishu App Secret */}
                    <div className="space-y-1">
                      <label className="block text-sm text-[var(--color-text-secondary)]">
                        {t('settings_integrations_feishu_app_secret')}
                      </label>
                      <div className="relative">
                        <input
                          type={feishuShowSecret ? 'text' : 'password'}
                          value={feishuAppSecret}
                          onChange={(e) => setFeishuAppSecret(e.target.value)}
                          onBlur={() => autoSave('feishu_app_secret', feishuAppSecret)}
                          placeholder={t('settings_integrations_feishu_app_secret_placeholder')}
                          className="w-full px-3 py-2 pr-10 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-colors duration-150"
                        />
                        <button
                          type="button"
                          onClick={() => setFeishuShowSecret(!feishuShowSecret)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                        >
                          {feishuShowSecret ? (
                            <EyeOff className="w-5 h-5" strokeWidth={2} />
                          ) : (
                            <Eye className="w-5 h-5" strokeWidth={2} />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Test Connection Button */}
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => checkFeishuConnection(feishuAppId, feishuAppSecret)}
                        disabled={!feishuAppId.trim() || !feishuAppSecret.trim() || feishuStatus === 'checking'}
                        className="px-4 py-2 text-sm font-medium bg-[var(--color-accent)] text-white rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                      >
                        {t('settings_integrations_feishu_test_connection')}
                      </button>
                      {feishuStatus === 'checking' && (
                        <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                          {t('settings_ai_testing_connection')}
                        </div>
                      )}
                      {feishuStatus === 'connected' && (
                        <div className="flex items-center gap-2 text-sm text-green-500">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          {t('settings_integrations_feishu_connected')}
                        </div>
                      )}
                      {feishuStatus === 'error' && (
                        <div className="flex items-center gap-2 text-sm text-red-500">
                          <div className="w-2 h-2 rounded-full bg-red-500" />
                          {feishuError || t('settings_integrations_feishu_connection_failed')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Shared import status (used by both Markdown and Apple Notes) */}
                  {(importResult || importError) && (
                    <div className="space-y-2">
                      {importResult && (
                        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-md text-sm">
                          <div className="text-green-400 font-medium mb-1">{t('settings_integrations_import_complete')}</div>
                          <div className="text-[var(--color-text-secondary)] space-y-0.5">
                            <div>{t('settings_integrations_imported_notes', { count: importResult.imported })}</div>
                            {importResult.tags_created > 0 && (
                              <div>{t('settings_integrations_tags_created', { count: importResult.tags_created })}</div>
                            )}
                            {importResult.errors > 0 && (
                              <div>{t('settings_integrations_errors', { count: importResult.errors })}</div>
                            )}
                            {importResult.skipped > 0 && (
                              <div>{t('settings_integrations_skipped', { count: importResult.skipped })}</div>
                            )}
                          </div>
                        </div>
                      )}
                      {importError && (
                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-md text-sm">
                          <div className="text-red-400 font-medium mb-1">{t('settings_integrations_import_failed')}</div>
                          <div className="text-[var(--color-text-secondary)]">{importError}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Markdown folder — desktop only */}
                  {isDesktopApp() && (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => toggleIntegration('markdown')}
                        className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)] hover:text-white transition-colors w-full"
                      >
                        <ChevronRight
                          className={`w-4 h-4 transition-transform ${expandedIntegration === 'markdown' ? 'rotate-90' : ''}`}
                          strokeWidth={2}
                        />
                        {t('settings_integrations_markdown_folder')}
                      </button>

                      {expandedIntegration === 'markdown' && (
                        <div className="space-y-3 pl-6 border-l-2 border-[var(--color-border)]">
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {t('settings_integrations_markdown_folder_desc')}
                          </p>

                          <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={importTags}
                              onChange={(e) => setImportTags(e.target.checked)}
                              disabled={isImporting}
                              className="rounded border-[var(--color-border)]"
                            />
                            {t('settings_integrations_import_tags_folders')}
                          </label>

                          <Button
                            variant="secondary"
                            onClick={handleObsidianImport}
                            disabled={isImporting}
                            className="w-full justify-center"
                          >
                            {isImporting ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin mr-2" strokeWidth={2} />
                                {importProgress
                                  ? t('settings_integrations_importing_progress', { current: importProgress.current, total: importProgress.total })
                                  : t('settings_integrations_importing')}
                              </>
                            ) : (
                              <>
                                <Upload className="w-4 h-4 mr-2" strokeWidth={2} />
                                {t('settings_integrations_choose_folder')}
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Apple Notes — desktop macOS only */}
                  {isDesktopApp() && isMacOS() && (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => toggleIntegration('apple-notes')}
                        className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)] hover:text-white transition-colors w-full"
                      >
                        <ChevronRight
                          className={`w-4 h-4 transition-transform ${expandedIntegration === 'apple-notes' ? 'rotate-90' : ''}`}
                          strokeWidth={2}
                        />
                        {t('settings_integrations_apple_notes')}
                      </button>

                      {expandedIntegration === 'apple-notes' && (
                        <div className="space-y-3 pl-6 border-l-2 border-[var(--color-border)]">
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {t('settings_integrations_apple_notes_desc')}
                          </p>

                          <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={importTags}
                              onChange={(e) => setImportTags(e.target.checked)}
                              disabled={isImporting}
                              className="rounded border-[var(--color-border)]"
                            />
                            {t('settings_integrations_import_tags_apple_notes')}
                          </label>

                          <Button
                            variant="secondary"
                            onClick={handleAppleNotesImport}
                            disabled={isImporting}
                            className="w-full justify-center"
                          >
                            {isImporting ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin mr-2" strokeWidth={2} />
                                {importProgress
                                  ? t('settings_integrations_importing_progress', { current: importProgress.current, total: importProgress.total })
                                  : t('settings_integrations_importing')}
                              </>
                            ) : (
                              <>
                                <Upload className="w-4 h-4 mr-2" strokeWidth={2} />
                                {t('settings_integrations_import_from_apple_notes')}
                              </>
                            )}
                          </Button>

                          {appleNotesNeedsFda && (
                            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-md text-sm space-y-2">
                              <div className="text-amber-400 font-medium">{t('settings_integrations_full_disk_access_required')}</div>
                              <p className="text-xs text-[var(--color-text-secondary)]">
                                {t('settings_integrations_grant_access')}
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => openExternalUrl(MACOS_FULL_DISK_ACCESS_URL)}
                                >
                                  {t('settings_integrations_open_system_settings')}
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={handleAppleNotesImport}
                                  disabled={isImporting}
                                >
                                  {t('settings_integrations_try_again')}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* MCP Server Setup Section — available when connected */}
                  {getTransport().isConnected() && (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => toggleIntegration('mcp')}
                        className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)] hover:text-white transition-colors w-full"
                      >
                        <ChevronRight
                          className={`w-4 h-4 transition-transform ${showMcpSetup ? 'rotate-90' : ''}`}
                          strokeWidth={2}
                        />
                        {t('settings_integrations_mcp_integration')}
                      </button>

                      {showMcpSetup && (
                        <div className="space-y-4 pl-6 border-l-2 border-[var(--color-border)]">
                          {isDesktopApp() && isLocalServer() ? (
                            <>
                              <p className="text-xs text-[var(--color-text-secondary)]">
                                {t('settings_integrations_mcp_bundled')}
                              </p>

                              <div className="space-y-2">
                                <div className="text-sm font-medium text-[var(--color-text-primary)]">{t('settings_integrations_setup_instructions')}</div>
                                <ol className="text-xs text-[var(--color-text-secondary)] space-y-2 list-decimal list-inside">
                                  <li>{t('settings_integrations_mcp_client_settings')}</li>
                                  <li>{t('settings_integrations_mcp_add_config')}</li>
                                </ol>
                              </div>

                              <div className="relative">
                                <pre className="p-3 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-md text-xs text-[var(--color-text-primary)] overflow-x-auto">
                                  {mcpConfig ? JSON.stringify(mcpConfig, null, 2) : t('common_loading')}
                                </pre>
                                <button
                                  type="button"
                                  onClick={handleCopyMcpConfig}
                                  disabled={!mcpConfig}
                                  className="absolute top-2 right-2 p-1.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-50"
                                  title={t('common_copy_to_clipboard')}
                                >
                                  {mcpConfigCopied ? (
                                    <Check className="w-4 h-4 text-green-500" strokeWidth={2} />
                                  ) : (
                                    <Copy className="w-4 h-4" strokeWidth={2} />
                                  )}
                                </button>
                              </div>

                              <ol start={3} className="text-xs text-[var(--color-text-secondary)] space-y-2 list-decimal list-inside">
                                <li>{t('settings_integrations_mcp_save_restart')}</li>
                              </ol>

                              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-md text-xs text-green-400">
                                <strong>{t('common_note') || 'Note'}:</strong> {t('settings_integrations_mcp_desktop_note')}
                              </div>
                            </>
                          ) : (
                            <>
                              <p className="text-xs text-[var(--color-text-secondary)]">
                                {t('settings_integrations_mcp_http_endpoint')}
                              </p>

                              {!mcpConfig ? (
                                <div className="space-y-2">
                                  <Button variant="secondary" size="sm" onClick={handleCreateMcpToken} disabled={isCreatingMcpToken}>
                                    {isCreatingMcpToken ? t('common_creating') : t('settings_integrations_mcp_create_token')}
                                  </Button>
                                  {mcpTokenError && <p className="text-xs text-red-500">{mcpTokenError}</p>}
                                </div>
                              ) : (
                                <>
                                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-md text-xs text-amber-400">
                                    {t('settings_integrations_mcp_token_warning')}
                                  </div>

                                  <div className="space-y-2">
                                    <div className="text-sm font-medium text-[var(--color-text-primary)]">{t('settings_integrations_setup_instructions')}</div>
                                    <ol className="text-xs text-[var(--color-text-secondary)] space-y-2 list-decimal list-inside">
                                      <li>{t('settings_integrations_mcp_client_settings')}</li>
                                      <li>{t('settings_integrations_mcp_add_config')}</li>
                                    </ol>
                                  </div>

                                  <div className="relative">
                                    <pre className="p-3 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-md text-xs text-[var(--color-text-primary)] overflow-x-auto">
                                      {JSON.stringify(mcpConfig, null, 2)}
                                    </pre>
                                    <button
                                      type="button"
                                      onClick={handleCopyMcpConfig}
                                      className="absolute top-2 right-2 p-1.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
                                      title={t('common_copy_to_clipboard')}
                                    >
                                      {mcpConfigCopied ? (
                                        <Check className="w-4 h-4 text-green-500" strokeWidth={2} />
                                      ) : (
                                        <Copy className="w-4 h-4" strokeWidth={2} />
                                      )}
                                    </button>
                                  </div>

                                  <ol start={3} className="text-xs text-[var(--color-text-secondary)] space-y-2 list-decimal list-inside">
                                    <li>{t('settings_integrations_mcp_save_restart')}</li>
                                  </ol>

                                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-md text-xs text-green-400">
                                    <strong>{t('common_note') || 'Note'}:</strong> {t('settings_integrations_mcp_server_note')}
                                  </div>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ===== DATABASES TAB ===== */}
              {activeTab === 'databases' && (
                <DatabasesTab />
              )}
          </div>
        </div>

        {saveError && (
          <div className="px-6 py-3 border-t border-[var(--color-border)]">
            <div className="flex items-start gap-2 text-sm text-red-500">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" strokeWidth={2} />
              <span>{saveError}</span>
            </div>
          </div>
        )}

        <Modal
          isOpen={!!pendingEmbeddingChange}
          onClose={cancelEmbeddingChange}
          title={t('settings_ai_reembed_modal_title')}
          confirmLabel={t('settings_ai_reembed_modal_confirm')}
          onConfirm={confirmEmbeddingChange}
        >
          <p className="text-sm text-[var(--color-text-secondary)]">
            {t('settings_ai_reembed_modal_desc', { model: pendingEmbeddingChange?.label })}
          </p>
        </Modal>
      </div>
    </div>,
    document.body
  );
}
