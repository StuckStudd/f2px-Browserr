import { createRoot } from 'react-dom/client'
import { internalPageOf } from '@shared/url'
import '../styles/fonts.css'
import '../styles/tokens.css'
import '../styles/base.css'
import '../styles/components.css'
import '../styles/pages.css'
import { useAppearance } from '../hooks/useAppearance'
import { useSettings } from '../hooks/useSettings'
import { BookmarksPage } from './BookmarksPage'
import { DownloadsPage } from './DownloadsPage'
import { ErrorPage } from './ErrorPage'
import { HistoryPage } from './HistoryPage'
import { HomePage } from './home/HomePage'
import { SettingsPage } from './SettingsPage'
import { UnlockPage } from './UnlockPage'
import { WelcomePage } from './WelcomePage'

const TITLES = {
  home: 'New tab',
  history: 'History',
  downloads: 'Downloads',
  bookmarks: 'Bookmarks',
  settings: 'Settings',
  error: 'Page unavailable',
  welcome: 'Welcome to F2PX',
  unlock: 'F2PX is locked'
} as const

function App({ page }: { page: keyof typeof TITLES }) {
  const [settings, update] = useSettings()
  useAppearance(settings)
  document.title = TITLES[page]

  // Error pages must render even if the settings bridge is unavailable.
  if (page === 'error') return <ErrorPage />
  if (!settings) return null

  switch (page) {
    case 'history':
      return <HistoryPage />
    case 'downloads':
      return <DownloadsPage settings={settings} />
    case 'bookmarks':
      return <BookmarksPage />
    case 'settings':
      return <SettingsPage settings={settings} update={update} />
    case 'welcome':
      return <WelcomePage settings={settings} update={update} />
    default:
      return <HomePage settings={settings} />
  }
}

/** The password window has no F2PX bridge, so it must not run any of the data hooks in App. */
function Root() {
  const page = internalPageOf(window.location.href) ?? 'home'
  if (page === 'unlock') {
    document.title = TITLES.unlock
    return <UnlockPage />
  }
  return <App page={page} />
}

createRoot(document.getElementById('root') as HTMLElement).render(<Root />)
