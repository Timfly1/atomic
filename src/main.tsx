import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import App from './App'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import './i18n'
import './index.css'
import { initTransport } from './lib/transport'

// iOS PWA keyboard fix: Ensure inputs receive focus when tapped
// This is a known issue where iOS PWA standalone mode doesn't always
// trigger the keyboard when tapping input fields
function initIOSPWAKeyboardFix() {
  if (typeof document === 'undefined') return;

  document.addEventListener('touchend', (e: TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      // Small delay to ensure the element is ready for focus
      setTimeout(() => {
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          (target as HTMLInputElement | HTMLTextAreaElement).focus();
        } else {
          target.focus();
        }
      }, 10);
    }
  }, { passive: true });
}

// Initialize iOS PWA keyboard fix
initIOSPWAKeyboardFix();

initTransport()
  .catch((err) => console.error('Transport init failed:', err))
  .then(() => {
    const app = (
      <ErrorBoundary>
        <I18nextProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </I18nextProvider>
      </ErrorBoundary>
    )

    ReactDOM.createRoot(document.getElementById('root')!).render(app)
  })
