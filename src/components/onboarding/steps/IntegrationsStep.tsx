import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { Button } from '../../ui/Button';
import { QRCode } from '../QRCode';
import {
  getMcpStdioConfig,
  getMcpHttpConfig,
  createApiToken,
  createFeed,
  ingestUrl as apiIngestUrl,
  importObsidianVault,
  type McpConfig,
  type ImportResult,
  type IngestionResult,
} from '../../../lib/api';
import { isDesktopApp, getLocalServerConfig, getTransport, isLocalServer, getMcpBridgePath } from '../../../lib/transport';
import type { HttpTransport } from '../../../lib/transport/http';
import { pickDirectory } from '../../../lib/platform';
import type { OnboardingState, OnboardingAction } from '../useOnboardingState';

function copyToClipboard(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  return Promise.resolve();
}

function getServerInfo() {
  if (isDesktopApp() && isLocalServer()) {
    const localConfig = getLocalServerConfig();
    return {
      url: localConfig?.baseUrl || 'http://127.0.0.1:44380',
      token: localConfig?.authToken || '',
    };
  }
  const transport = getTransport() as HttpTransport;
  const config = transport.getConfig();
  return { url: config.baseUrl, token: config.authToken };
}

// --- Collapsible section wrapper ---

function Section({
  title,
  description,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 bg-[var(--color-bg-card)] hover:bg-[var(--color-bg-hover)] transition-colors text-left"
      >
        <div>
          <h3 className="text-sm font-medium text-[var(--color-text-primary)]">{title}</h3>
          <p className="text-xs text-[var(--color-text-secondary)]">{description}</p>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-[var(--color-text-secondary)] transition-transform duration-200 shrink-0 ml-3 ${isOpen ? 'rotate-180' : ''}`}
          strokeWidth={2}
        />
      </button>
      {isOpen && <div className="p-4 border-t border-[var(--color-border)] space-y-3">{children}</div>}
    </div>
  );
}

// --- MCP content ---

function McpLocalContent() {
  const { t } = useTranslation();
  const [mcpConfig, setMcpConfig] = useState<McpConfig | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMcpBridgePath().then((path) => {
      if (path) setMcpConfig(getMcpStdioConfig(path));
      else setError(t('onboarding_mcp_setup_bridge_not_found'));
    });
  }, [t]);

  const handleCopy = async () => {
    if (!mcpConfig) return;
    await copyToClipboard(JSON.stringify(mcpConfig, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const configJson = mcpConfig ? JSON.stringify(mcpConfig, null, 2) : '';

  return (
    <>
      <p className="text-sm text-[var(--color-text-secondary)]">
        {t('onboarding_mcp_local_description')}
      </p>
      <ol className="space-y-1.5 text-sm text-[var(--color-text-secondary)] list-decimal list-inside">
        <li>{t('onboarding_mcp_step_1')}</li>
        <li>{t('onboarding_mcp_step_2')}</li>
      </ol>
      <div className="relative">
        <pre className="p-3 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-lg text-xs text-[var(--color-text-primary)] overflow-x-auto font-mono">
          {configJson || (error ? '' : t('onboarding_mcp_loading'))}
        </pre>
        <Button variant="secondary" size="sm" onClick={handleCopy} className="absolute top-2 right-2" disabled={!mcpConfig}>
          {copied ? t('onboarding_mcp_copied') : t('onboarding_mcp_copy')}
        </Button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <p className="text-xs text-[var(--color-text-secondary)]">
        {t('onboarding_mcp_restart_note')}
      </p>
    </>
  );
}

function McpRemoteContent() {
  const { t } = useTranslation();
  const [mcpConfig, setMcpConfig] = useState<McpConfig | null>(null);
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateToken = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const result = await createApiToken('mcp-integration');
      const transport = getTransport() as HttpTransport;
      setMcpConfig(getMcpHttpConfig(transport.getConfig().baseUrl, result.token));
    } catch (e) {
      setError(String(e));
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!mcpConfig) return;
    await copyToClipboard(JSON.stringify(mcpConfig, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const configJson = mcpConfig ? JSON.stringify(mcpConfig, null, 2) : '';

  return (
    <>
      <p className="text-sm text-[var(--color-text-secondary)]">
        {t('onboarding_mcp_remote_description')}
      </p>
      {!mcpConfig ? (
        <div className="space-y-2">
          <Button variant="secondary" onClick={handleCreateToken} disabled={isCreating}>
            {isCreating ? t('onboarding_mcp_creating') : t('onboarding_mcp_create_token')}
          </Button>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      ) : (
        <>
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-md text-xs text-amber-400">
            {t('onboarding_mcp_token_warning')}
          </div>
          <ol className="space-y-1.5 text-sm text-[var(--color-text-secondary)] list-decimal list-inside">
            <li>{t('onboarding_mcp_step_1')}</li>
            <li>{t('onboarding_mcp_step_2')}</li>
          </ol>
          <div className="relative">
            <pre className="p-3 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-lg text-xs text-[var(--color-text-primary)] overflow-x-auto font-mono">
              {configJson}
            </pre>
            <Button variant="secondary" size="sm" onClick={handleCopy} className="absolute top-2 right-2">
              {copied ? t('onboarding_mcp_copied') : t('onboarding_mcp_copy')}
            </Button>
          </div>
          <p className="text-xs text-[var(--color-text-secondary)]">
            {t('onboarding_mcp_restart_note')}
          </p>
        </>
      )}
    </>
  );
}

function McpContent() {
  if (isDesktopApp() && isLocalServer()) {
    return <McpLocalContent />;
  }
  return <McpRemoteContent />;
}

// --- Mobile content ---

function MobileContent({
  state,
  dispatch,
}: {
  state: OnboardingState;
  dispatch: React.Dispatch<OnboardingAction>;
}) {
  const { t } = useTranslation();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { url } = getServerInfo();

  const handleGenerateQR = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const result = await createApiToken('mobile-setup');
      dispatch({ type: 'SET_MOBILE_TOKEN', token: result.token });
    } catch (e) {
      setError(String(e));
    } finally {
      setIsGenerating(false);
    }
  };

  const qrPayload = state.mobileToken
    ? JSON.stringify({ url, token: state.mobileToken })
    : null;

  const handleCopy = async () => {
    if (!qrPayload) return;
    await copyToClipboard(qrPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!state.mobileToken) {
    return (
      <>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {t('onboarding_mobile_setup_description')}
        </p>
        <Button variant="secondary" onClick={handleGenerateQR} disabled={isGenerating}>
          {isGenerating ? t('onboarding_mobile_setup_generating') : t('onboarding_mobile_setup_generate_qr')}
        </Button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col items-center space-y-3">
        <div className="p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg">
          <QRCode value={qrPayload!} size={180} />
        </div>
        <p className="text-xs text-[var(--color-text-secondary)] text-center">
          {t('onboarding_mobile_setup_scan_qr')}
        </p>
      </div>
      <div className="flex gap-2">
        <code className="flex-1 px-3 py-2 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-md text-xs text-[var(--color-text-primary)] truncate">
          {url}
        </code>
        <Button variant="secondary" size="sm" onClick={handleCopy}>
          {copied ? t('onboarding_mobile_setup_copied') : t('onboarding_mobile_setup_copy')}
        </Button>
      </div>
    </>
  );
}

// --- Extension content ---

function ExtensionContent() {
  const { t } = useTranslation();
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const serverInfo = getServerInfo();

  return (
    <>
      <ol className="space-y-1.5 text-sm text-[var(--color-text-secondary)] list-decimal list-inside">
        <li>
          <a
            href="https://chromewebstore.google.com/detail/atomic-web-clipper/bknijbafnefbaklndpglcmlhaglikccf"
            target="_blank"
            rel="noreferrer noopener"
            className="text-[var(--color-accent)] hover:underline"
          >
            {t('onboarding_extension_install')}
          </a>
        </li>
        <li>{t('onboarding_extension_click_icon')}</li>
        <li>{t('onboarding_extension_enter_url_token')}</li>
      </ol>
      <div className="space-y-2">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-[var(--color-text-secondary)]">{t('onboarding_extension_server_url_label')}</label>
          <div className="flex gap-2">
            <code className="flex-1 px-3 py-2 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-md text-xs text-[var(--color-text-primary)] truncate">
              {serverInfo.url}
            </code>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await copyToClipboard(serverInfo.url);
                setCopiedUrl(true);
                setTimeout(() => setCopiedUrl(false), 2000);
              }}
            >
              {copiedUrl ? t('onboarding_extension_copied') : t('onboarding_extension_copy')}
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-[var(--color-text-secondary)]">{t('onboarding_extension_auth_token_label')}</label>
          <div className="flex gap-2">
            <code className="flex-1 px-3 py-2 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-md text-xs text-[var(--color-text-primary)] truncate">
              {serverInfo.token ? `${serverInfo.token.substring(0, 12)}...` : 'N/A'}
            </code>
            <Button
              variant="secondary"
              size="sm"
              disabled={!serverInfo.token}
              onClick={async () => {
                await copyToClipboard(serverInfo.token);
                setCopiedToken(true);
                setTimeout(() => setCopiedToken(false), 2000);
              }}
            >
              {copiedToken ? t('onboarding_extension_copied') : t('onboarding_extension_copy')}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// --- Data loading content ---

function DataLoadingContent({
  state,
  dispatch,
}: {
  state: OnboardingState;
  dispatch: React.Dispatch<OnboardingAction>;
}) {
  const { t } = useTranslation();
  const isDesktop = isDesktopApp();

  const [addingFeed, setAddingFeed] = useState(false);
  const [feedAdded, setFeedAdded] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<IngestionResult | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

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
      const selected = await pickDirectory(t('onboarding_data_select_vault'));
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
    <>
      {/* RSS Feed */}
      <div>
        <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">{t('onboarding_data_rss_feed')}</label>
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
        {feedAdded && <p className="text-xs text-green-500 mt-1">{t('onboarding_data_feed_added')}</p>}
        {feedError && <p className="text-xs text-red-500 mt-1">{feedError}</p>}
      </div>

      {/* URL Ingest */}
      <div>
        <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">{t('onboarding_data_ingest_url')}</label>
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
        {ingestResult && <p className="text-xs text-green-500 mt-1">{t('onboarding_data_ingested')}: {ingestResult.title}</p>}
        {ingestError && <p className="text-xs text-red-500 mt-1">{ingestError}</p>}
      </div>

      {/* Obsidian Import (desktop only) */}
      {isDesktop && (
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">{t('onboarding_data_import_obsidian')}</label>
          <Button variant="secondary" onClick={handleObsidianImport} disabled={isImporting}>
            {isImporting ? t('onboarding_data_importing') : t('onboarding_data_select_vault')}
          </Button>
          {importResult && (
            <p className="text-xs text-green-500 mt-1">
              {t('onboarding_data_imported_notes', { imported: importResult.imported, skipped: importResult.skipped })}
            </p>
          )}
          {importError && <p className="text-xs text-red-500 mt-1">{importError}</p>}
        </div>
      )}
    </>
  );
}

// --- Main component ---

interface IntegrationsStepProps {
  state: OnboardingState;
  dispatch: React.Dispatch<OnboardingAction>;
}

export function IntegrationsStep({ state, dispatch }: IntegrationsStepProps) {
  const { t } = useTranslation();
  const [openSection, setOpenSection] = useState<string | null>(null);

  const toggle = (id: string) => setOpenSection(prev => (prev === id ? null : id));

  return (
    <div className="space-y-3 px-2">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-1">{t('onboarding_integrations_title')}</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {t('onboarding_integrations_subtitle')}
        </p>
      </div>

      <Section
        title={t('onboarding_integrations_mcp')}
        description={t('onboarding_integrations_mcp_description')}
        isOpen={openSection === 'mcp'}
        onToggle={() => toggle('mcp')}
      >
        <McpContent />
      </Section>

      <Section
        title={t('onboarding_integrations_mobile')}
        description={t('onboarding_integrations_mobile_description')}
        isOpen={openSection === 'mobile'}
        onToggle={() => toggle('mobile')}
      >
        <MobileContent state={state} dispatch={dispatch} />
      </Section>

      <Section
        title={t('onboarding_integrations_extension')}
        description={t('onboarding_integrations_extension_description')}
        isOpen={openSection === 'extension'}
        onToggle={() => toggle('extension')}
      >
        <ExtensionContent />
      </Section>

      <Section
        title={t('onboarding_integrations_import_data')}
        description={t('onboarding_integrations_import_data_description')}
        isOpen={openSection === 'data'}
        onToggle={() => toggle('data')}
      >
        <DataLoadingContent state={state} dispatch={dispatch} />
      </Section>
    </div>
  );
}
