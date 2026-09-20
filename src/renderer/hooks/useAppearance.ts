import { useEffect } from 'react'
import type { Settings } from '@shared/types'

const ACCENTS: Record<'white' | 'gray', string> = { white: '', gray: '#9a9a9a' }

/** Mirrors theme / accent / animation / density settings onto <html> as data attributes and CSS variables. */
export function useAppearance(settings: Settings | null): void {
  useEffect(() => {
    if (!settings) return
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: light)')

    const apply = (): void => {
      const resolved = settings.theme === 'system' ? (media.matches ? 'light' : 'dark') : settings.theme
      root.dataset.theme = resolved
    }
    apply()
    media.addEventListener('change', apply)

    root.dataset.anim = settings.animations ? 'on' : 'off'
    root.dataset.compact = settings.compactMode ? 'on' : 'off'
    const accent = settings.accent === 'custom' ? settings.accentCustom : ACCENTS[settings.accent]
    if (accent) root.style.setProperty('--accent', accent)
    else root.style.removeProperty('--accent')

    return () => media.removeEventListener('change', apply)
  }, [settings])
}
