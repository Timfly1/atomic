import { useState } from 'react';
import {
  Check,
  ChevronRight,
  Copy,
  FolderOpen,
  Link2,
  NotebookPen,
  Plug,
  Rss,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import {
  createApiToken,
  createFeed,
  getMcpHttpConfig,
  getMcpStdioConfig,
  ingestUrl,
  type McpHttpConfig,
  type McpStdioConfig,
} from '../../lib/api';
import { importMarkdownFolder } from '../../lib/import';
import { AppleNotesImportError, importAppleNotes } from '../../lib/import-apple-notes';
import {
  getLocalServerConfig,
  getMcpBridgePath,
  getTransport,
  isDesktopApp,
  isLocalServer,
} from '../../lib/transport';
import { isMacOS, openExternalUrl, pickDirectory } from '../../lib/platform';
import { copyToClipboard } from '../../lib/clipboard';
import { useAtomsStore } from '../../stores/atoms';
import { useTagsStore } from '../../stores/tags';
import type { HttpTransport } from '../../lib/transport/http';

type OptionId = 'url' | 'feed' | 'markdown' | 'apple-notes' | 'mcp';

interface OptionMeta {
  id: OptionId;
  Icon: typeof Link2;
  title: string;
  subtitle: string;
}

function getMeta(t: (key: string) => string): Record<OptionId, OptionMeta> {
  return {
    url: {
      id: 'url',
      Icon: Link2,
      title: t('dashboard_capture_url_title'),
      subtitle: t('dashboard_capture_url_subtitle'),
    },
    feed: {
      id: 'feed',
      Icon: Rss,
      title: t('dashboard_subscribe_feed_title'),
      subtitle: t('dashboard_subscribe_feed_subtitle'),
    },
    markdown: {
      id: 'markdown',
      Icon: FolderOpen,
      title: t('dashboard_import_markdown_title'),
      subtitle: t('dashboard_import_markdown_subtitle'),
    },
    'apple-notes': {
      id: 'apple-notes',
      Icon: NotebookPen,
      title: t('dashboard_import_apple_notes_title'),
      subtitle: t('dashboard_import_apple_notes_subtitle'),
    },
    mcp: {
      id: 'mcp',
      Icon: Plug,
      title: t('dashboard_connect_mcp_title'),
      subtitle: t('dashboard_connect_mcp_subtitle'),
    },
  };
}

export function CaptureOptions() {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<OptionId | null>(null);

  const ids: OptionId[] = ['url', 'feed'];
  if (isDesktopApp() && isLocalServer()) ids.push('markdown');
  if (isDesktopApp() && isMacOS()) ids.push('apple-notes');
  ids.push('mcp');

  const META = getMeta(t);

  return (
    <section className="mt-12">
      <header className="flex items-center gap-3 mb-1 h-5">
        <h3 className="text-[11px] leading-none font-medium uppercase tracking-[0.14em] text-[var(--color-text-tertiary)] whitespace-nowrap">
          {t('dashboard_more_ways_to_capture')}
        </h3>
        <div className="flex-1 h-px bg-[var(--color-border)]" />
      </header>
      <div>
        {ids.map(id => (
          <OptionRow
            key={id}
            meta={META[id]}
            expanded={openId === id}
            onToggle={() => setOpenId(openId === id ? null : id)}
          />
        ))}
      </div>
    </section>
  );
}

interface OptionRowProps {
  meta: OptionMeta;
  expanded: boolean;
  onToggle: () => void;
}

function OptionRow({ meta, expanded, onToggle }: OptionRowProps) {
  const { Icon } = meta;
  return (
    <div className="border-b border-[var(--color-border)]">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 py-4 text-left group"
      >
        <div className="w-9 h-9 flex items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg-hover)]/30 shrink-0 transition-colors group-hover:border-[var(--color-text-tertiary)]">
          <Icon className="w-4 h-4 text-[var(--color-text-secondary)]" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--color-text-primary)]">{meta.title}</div>
          <div className="text-[12px] text-[var(--color-text-tertiary)] mt-0.5">{meta.subtitle}</div>
        </div>
        <ChevronRight
          className={`w-4 h-4 text-[var(--color-text-tertiary)] transition-transform ${expanded ? 'rotate-90' : ''}`}
          strokeWidth={2}
        />
      </button>
      {expanded && (
        <div className="pr-1 pb-5" style={{ paddingLeft: '3.25rem' }}>
          <OptionBody id={meta.id} />
        </div>
      )}
    </div>
  );
}

function OptionBody({ id }: { id: OptionId }) {
  switch (id) {
    case 'url': return <UrlBody />;
    case 'feed': return <FeedBody />;
    case 'markdown': return <MarkdownBody />;
    case 'apple-notes': return <AppleNotesBody />;
    case 'mcp': return <McpBody />;
  }
}

// ---------------------------------------------------------------- URL ----

function UrlBody() {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: true; title: string } | { ok: false; error: string } | null>(null);
  const fetchAtoms = useAtomsStore(s => s.fetchAtoms);

  const submit = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await ingestUrl(trimmed);
      setResult({ ok: true, title: res.title });
      setUrl('');
      void fetchAtoms();
    } catch (e) {
      setResult({ ok: false, error: String(e) });
    }
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          placeholder={t('dashboard_url_placeholder')}
          className="flex-1 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded px-3 py-1.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
          autoFocus
        />
        <Button size="sm" onClick={submit} disabled={busy || !url.trim()}>
          {busy ? t('dashboard_saving') : t('dashboard_capture_button')}
        </Button>
      </div>
      {result?.ok && (
        <div className="text-[12px] text-emerald-400">{t('dashboard_saved')} {result.title || t('dashboard_untitled')}</div>
      )}
      {result && !result.ok && (
        <div className="text-[12px] text-red-400">{result.error}</div>
      )}
    </div>
  );
}

// --------------------------------------------------------------- Feed ----

function FeedBody() {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: true; title: string | null } | { ok: false; error: string } | null>(null);

  const submit = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setResult(null);
    try {
      const feed = await createFeed(trimmed);
      setResult({ ok: true, title: feed.title });
      setUrl('');
    } catch (e) {
      setResult({ ok: false, error: String(e) });
    }
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          placeholder={t('dashboard_feed_placeholder')}
          className="flex-1 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded px-3 py-1.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
          autoFocus
        />
        <Button size="sm" onClick={submit} disabled={busy || !url.trim()}>
          {busy ? t('dashboard_adding') : t('dashboard_subscribe_button')}
        </Button>
      </div>
      <p className="text-[12px] text-[var(--color-text-tertiary)]">
        {t('dashboard_feed_poll_hint')}
      </p>
      {result?.ok && (
        <div className="text-[12px] text-emerald-400">{t('dashboard_subscribed')}{result.title ? `: ${result.title}` : ''}.</div>
      )}
      {result && !result.ok && (
        <div className="text-[12px] text-red-400">{result.error}</div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ Markdown ----

function MarkdownBody() {
  const { t } = useTranslation();
  const [importTags, setImportTags] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchAtoms = useAtomsStore(s => s.fetchAtoms);
  const fetchTags = useTagsStore(s => s.fetchTags);

  const choose = async () => {
    setError(null);
    setResult(null);
    const dir = await pickDirectory('Select markdown folder');
    if (!dir) return;
    setBusy(true);
    setProgress({ processed: 0, total: 0 });
    try {
      const res = await importMarkdownFolder(dir, {
        importTags,
        onProgress: p => setProgress({ processed: p.current, total: p.total }),
      });
      setResult({ imported: res.imported, skipped: res.skipped });
      if (res.imported > 0) await Promise.all([fetchAtoms(), fetchTags()]);
    } catch (e) {
      setError(String(e));
    }
    setBusy(false);
    setProgress(null);
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-secondary)] cursor-pointer select-none">
        <input
          type="checkbox"
          checked={importTags}
          onChange={e => setImportTags(e.target.checked)}
          className="accent-[var(--color-accent)]"
        />
        {t('dashboard_turn_folders_into_tags')}
      </label>
      <div>
        <Button size="sm" variant="secondary" onClick={choose} disabled={busy}>
          {busy ? t('dashboard_importing') : t('dashboard_choose_folder')}
        </Button>
      </div>
      {progress && progress.total > 0 && (
        <div className="text-[12px] text-[var(--color-text-tertiary)] tabular-nums">
          {progress.processed} / {progress.total}
        </div>
      )}
      {result && (
        <div className="text-[12px] text-emerald-400">
          {t('dashboard_imported')} {result.imported} atom{result.imported === 1 ? '' : 's'}
          {result.skipped ? ` · ${t('dashboard_skipped')} ${result.skipped}` : ''}.
        </div>
      )}
      {error && <div className="text-[12px] text-red-400">{error}</div>}
    </div>
  );
}

// ---------------------------------------------------------- Apple Notes ----

function AppleNotesBody() {
  const { t } = useTranslation();
  const [importTags, setImportTags] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState<{ kind: AppleNotesImportError['kind'] | 'other'; message: string } | null>(null);
  const fetchAtoms = useAtomsStore(s => s.fetchAtoms);
  const fetchTags = useTagsStore(s => s.fetchTags);

  const run = async () => {
    setError(null);
    setResult(null);
    setBusy(true);
    setProgress({ processed: 0, total: 0 });
    try {
      const res = await importAppleNotes({
        importTags,
        onProgress: p => setProgress({ processed: p.current, total: p.total }),
      });
      setResult({ imported: res.imported, skipped: res.skipped });
      if (res.imported > 0) await Promise.all([fetchAtoms(), fetchTags()]);
    } catch (e) {
      if (e instanceof AppleNotesImportError) {
        setError({ kind: e.kind, message: e.message });
      } else {
        setError({ kind: 'other', message: String(e) });
      }
    }
    setBusy(false);
    setProgress(null);
  };

  const openPrivacyPrefs = () =>
    openExternalUrl(
      'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AllFiles',
    );

  return (
    <div className="space-y-3">
      {error?.kind === 'permissionDenied' ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-200 space-y-2">
          <div>{t('dashboard_apple_notes_permission_title')}</div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={openPrivacyPrefs}>
              {t('dashboard_open_system_settings')}
            </Button>
            <Button size="sm" onClick={run} disabled={busy}>
              {t('dashboard_try_again')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-secondary)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={importTags}
              onChange={e => setImportTags(e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
            {t('dashboard_turn_apple_notes_folders_into_tags')}
          </label>
          <div>
            <Button size="sm" variant="secondary" onClick={run} disabled={busy}>
              {busy ? t('dashboard_importing') : t('dashboard_import_notes')}
            </Button>
          </div>
        </>
      )}
      {progress && progress.total > 0 && (
        <div className="text-[12px] text-[var(--color-text-tertiary)] tabular-nums">
          {progress.processed} / {progress.total}
        </div>
      )}
      {result && (
        <div className="text-[12px] text-emerald-400">
          {t('dashboard_imported')} {result.imported} note{result.imported === 1 ? '' : 's'}
          {result.skipped ? ` · ${t('dashboard_skipped')} ${result.skipped}` : ''}.
        </div>
      )}
      {error && error.kind !== 'permissionDenied' && (
        <div className="text-[12px] text-red-400">{error.message}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- MCP ----

type McpConfigShape = McpStdioConfig | McpHttpConfig;

function McpBody() {
  const { t } = useTranslation();
  const local = isDesktopApp() && isLocalServer();
  const [config, setConfig] = useState<McpConfigShape | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadLocal = async () => {
    setError(null);
    setBusy(true);
    try {
      const bridge = await getMcpBridgePath();
      if (!bridge) throw new Error('MCP bridge binary not found.');
      setConfig(getMcpStdioConfig(bridge));
    } catch (e) {
      setError(String(e));
    }
    setBusy(false);
  };

  const loadRemote = async () => {
    setError(null);
    setBusy(true);
    try {
      const baseUrl = (() => {
        const lc = getLocalServerConfig();
        if (lc) return lc.baseUrl;
        return (getTransport() as HttpTransport).getConfig().baseUrl;
      })();
      if (!baseUrl) throw new Error('Server URL is not available.');
      const tokenResp = await createApiToken('mcp-integration');
      setConfig(getMcpHttpConfig(baseUrl, tokenResp.token));
    } catch (e) {
      setError(String(e));
    }
    setBusy(false);
  };

  const copy = async () => {
    if (!config) return;
    try {
      await copyToClipboard(JSON.stringify(config, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="space-y-3">
      {!config ? (
        <>
          <p className="text-[12px] text-[var(--color-text-tertiary)]">
            {local
              ? t('dashboard_mcp_local_description')
              : t('dashboard_mcp_remote_description')}
          </p>
          <Button size="sm" variant="secondary" onClick={local ? loadLocal : loadRemote} disabled={busy}>
            {busy ? t('dashboard_preparing') : local ? t('dashboard_show_config') : t('dashboard_generate_config')}
          </Button>
          {error && <div className="text-[12px] text-red-400">{error}</div>}
        </>
      ) : (
        <div className="space-y-2">
          {!local && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
              {t('dashboard_copy_token_warning')}
            </div>
          )}
          <div className="relative">
            <pre className="p-3 pr-10 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-md text-[12px] text-[var(--color-text-primary)] overflow-x-auto">
              {JSON.stringify(config, null, 2)}
            </pre>
            <button
              onClick={copy}
              className="absolute top-2 right-2 p-1.5 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
              title={t('dashboard_copy_to_clipboard')}
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2} />
              ) : (
                <Copy className="w-3.5 h-3.5" strokeWidth={2} />
              )}
            </button>
          </div>
          <p className="text-[11px] text-[var(--color-text-tertiary)]">
            {t('dashboard_mcp_config_hint')}
          </p>
        </div>
      )}
    </div>
  );
}
