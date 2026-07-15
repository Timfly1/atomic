import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { isDesktopApp, getLocalServerConfig } from '../../../lib/transport';
import type { HttpTransport } from '../../../lib/transport/http';
import { getTransport } from '../../../lib/transport';

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

export function ExtensionStep() {
  const { t } = useTranslation();
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  const getServerInfo = () => {
    if (isDesktopApp()) {
      const localConfig = getLocalServerConfig();
      return {
        url: localConfig?.baseUrl || 'http://127.0.0.1:44380',
        token: localConfig?.authToken || '',
      };
    }
    const transport = getTransport() as HttpTransport;
    const config = transport.getConfig();
    return { url: config.baseUrl, token: config.authToken };
  };

  const serverInfo = getServerInfo();

  const handleCopyUrl = async () => {
    await copyToClipboard(serverInfo.url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleCopyToken = async () => {
    await copyToClipboard(serverInfo.token);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="space-y-5 px-2">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-1">{t('onboarding_extension_title')}</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {t('onboarding_extension_subtitle')}
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg space-y-3">
          <h3 className="text-sm font-medium text-[var(--color-text-primary)]">{t('onboarding_extension_setup_instructions')}</h3>
          <ol className="space-y-2 text-sm text-[var(--color-text-secondary)] list-decimal list-inside">
            <li>{t('onboarding_extension_install')}</li>
            <li>{t('onboarding_extension_click_icon')}</li>
            <li>{t('onboarding_extension_enter_url_token')}</li>
          </ol>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--color-text-secondary)]">{t('onboarding_extension_server_url_label')}</label>
            <div className="flex gap-2">
              <code className="flex-1 px-3 py-2 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-md text-sm text-[var(--color-text-primary)] truncate">
                {serverInfo.url}
              </code>
              <Button variant="secondary" size="sm" onClick={handleCopyUrl}>
                {copiedUrl ? t('onboarding_extension_copied') : t('onboarding_extension_copy')}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--color-text-secondary)]">{t('onboarding_extension_auth_token_label')}</label>
            <div className="flex gap-2">
              <code className="flex-1 px-3 py-2 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-md text-sm text-[var(--color-text-primary)] truncate">
                {serverInfo.token ? `${serverInfo.token.substring(0, 12)}...` : 'N/A'}
              </code>
              <Button variant="secondary" size="sm" onClick={handleCopyToken} disabled={!serverInfo.token}>
                {copiedToken ? t('onboarding_extension_copied') : t('onboarding_extension_copy')}
              </Button>
            </div>
          </div>
        </div>

        <div className="p-3 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-md text-xs text-[var(--color-text-secondary)]">
          {t('onboarding_extension_api_note')}
        </div>
      </div>
    </div>
  );
}
