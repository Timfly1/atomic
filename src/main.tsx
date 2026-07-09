import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import App from './App'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import './i18n'
import './index.css'
import { initTransport } from './lib/transport'

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
