import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { getMcpStdioConfig, getMcpHttpConfig, createApiToken, type McpConfig } from '../../../lib/api';
import { isDesktopApp, isLocalServer, getMcpBridgePath, getTransport } from '../../../lib/transport';
import type { HttpTransport } from '../../../lib/transport/http';

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

export function McpSetupStep() {
  const { t } = useTranslation();
  const [mcpConfig, setMcpConfig] = useState<McpConfig | null>(null);
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLocal = isDesktopApp() && isLocalServer();

  useEffect(() => {
    if (isLocal) {
      getMcpBridgePath().then((path) => {
        if (path) setMcpConfig(getMcpStdioConfig(path));
        else setError(t('onboarding_mcp_setup_bridge_not_found'));
      });
    }
  }, [isLocal, t]);

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
    <div className="space-y-5 px-2">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-1">{t('onboarding_mcp_setup_title')}</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {t('onboarding_mcp_setup_subtitle')}
        </p>
      </div>

      <div className="space-y-4">
        {isLocal ? (
          <>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t('onboarding_mcp_setup_local_description')}
            </p>
            <div className="p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg space-y-3">
              <h3 className="text-sm font-medium text-[var(--color-text-primary)]">{t('onboarding_mcp_setup_setup_instructions')}</h3>
              <ol className="space-y-2 text-sm text-[var(--color-text-secondary)] list-decimal list-inside">
                <li>{t('onboarding_mcp_step_1')}</li>
                <li>{t('onboarding_mcp_step_2')}</li>
              </ol>
            </div>
            <div className="relative">
              <pre className="p-4 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-primary)] overflow-x-auto font-mono">
                {configJson || t('onboarding_mcp_loading')}
              </pre>
              <Button variant="secondary" size="sm" onClick={handleCopy} className="absolute top-2 right-2" disabled={!mcpConfig}>
                {copied ? t('onboarding_mcp_setup_copied') : t('onboarding_mcp_setup_copy')}
              </Button>
            </div>
          </>
        ) : !mcpConfig ? (
          <>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t('onboarding_mcp_setup_remote_description')}
            </p>
            <Button variant="secondary" onClick={handleCreateToken} disabled={isCreating}>
              {isCreating ? t('onboarding_mcp_setup_creating') : t('onboarding_mcp_setup_create_token')}
            </Button>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </>
        ) : (
          <>
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-md text-xs text-amber-400">
              {t('onboarding_mcp_setup_token_warning')}
            </div>
            <div className="p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg space-y-3">
              <h3 className="text-sm font-medium text-[var(--color-text-primary)]">{t('onboarding_mcp_setup_setup_instructions')}</h3>
              <ol className="space-y-2 text-sm text-[var(--color-text-secondary)] list-decimal list-inside">
                <li>{t('onboarding_mcp_step_1')}</li>
                <li>{t('onboarding_mcp_step_2')}</li>
              </ol>
            </div>
            <div className="relative">
              <pre className="p-4 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-primary)] overflow-x-auto font-mono">
                {configJson}
              </pre>
              <Button variant="secondary" size="sm" onClick={handleCopy} className="absolute top-2 right-2">
                {copied ? t('onboarding_mcp_setup_copied') : t('onboarding_mcp_setup_copy')}
              </Button>
            </div>
          </>
        )}

        <div className="p-3 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md text-xs text-[var(--color-text-secondary)]">
          <p>{t('onboarding_mcp_setup_restart_note')}</p>
        </div>
      </div>
    </div>
  );
}
