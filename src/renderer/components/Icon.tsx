import type { ReactNode, SVGProps } from 'react'

/** Thin-stroke technical icon set, 24x24 grid. */
const ICONS = {
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  forward: <path d="M5 12h14M13 6l6 6-6 6" />,
  reload: <path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  home: <path d="M4 11l8-7 8 7M6 10v10h12V10" />,
  download: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  upload: <path d="M12 15V4M7 8l5-4 5 4M5 20h14" />,
  history: <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3 4v5h5M12 7.5V12l3 2" />,
  settings: (
    <>
      <path d="M4 8h9M17 8h3M4 16h3M11 16h9" />
      <rect x="13" y="6" width="4" height="4" />
      <rect x="7" y="14" width="4" height="4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  star: <path d="M12 3.5l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1-5.4-3-5.4 3 1.1-6.1-4.5-4.3 6.1-.8z" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  warning: <path d="M12 4l9 16H3zM12 10v4M12 17v.5" />,
  dots: (
    <>
      <rect x="11" y="4" width="2" height="2" fill="currentColor" />
      <rect x="11" y="11" width="2" height="2" fill="currentColor" />
      <rect x="11" y="18" width="2" height="2" fill="currentColor" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
    </>
  ),
  folder: <path d="M3 6h7l2 2h9v11H3z" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />,
  pin: <path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7" />,
  volume: <path d="M4 9v6h4l5 4V5L8 9zM16.5 9a4 4 0 0 1 0 6" />,
  mute: <path d="M4 9v6h4l5 4V5L8 9zM17 9l4 6M21 9l-4 6" />,
  trash: <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" />,
  edit: <path d="M4 20l1-5L16 4l4 4L9 19z" />,
  check: <path d="M5 12l5 5L20 7" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  private: (
    <>
      <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M4 20L20 4" />
    </>
  ),
  file: <path d="M6 3h8l4 4v14H6zM14 3v4h4" />,
  pause: <path d="M8 5v14M16 5v14" />,
  play: <path d="M7 5l12 7-12 7z" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  shieldOff: (
    <>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" opacity=".55" />
      <path d="M5 4l14 16" />
    </>
  ),
  flame: <path d="M12 3c.6 3.6 5.2 5.6 5.2 10.2A5.2 5.2 0 0 1 12 18.4a5.2 5.2 0 0 1-5.2-5.2c0-2 1-3.2 2.2-4.3.2 1.4.9 2.2 2 2.4C10.6 8.2 10.8 5.6 12 3z" />,
  onion: (
    <>
      <path d="M12 3c-.8 3-6.5 5-6.5 10.2a6.5 6.5 0 0 0 13 0C18.5 8 12.8 6 12 3z" />
      <path d="M12 8c-.5 2.4-2.8 3.2-2.8 5.6a2.8 2.8 0 0 0 5.6 0C14.8 11.2 12.5 10.4 12 8z" />
    </>
  ),
  eye: (
    <>
      <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8v.5" />
    </>
  ),
  keyboard: (
    <>
      <rect x="3" y="6" width="18" height="12" />
      <path d="M7 10h.5M11 10h.5M15 10h.5M7 14h10" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  sliders: <path d="M5 6h14M5 12h14M5 18h14" />,
  printer: (
    <>
      <path d="M7 8V4h10v4M7 17H4v-7h16v7h-3" />
      <rect x="7" y="14" width="10" height="6" />
    </>
  ),
  code: <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13 6l-2 12" />,
  fullscreen: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  bookmark: <path d="M6 3h12v18l-6-4-6 4z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3.2 3 3.2 15 0 18M12 3c-3.2 3-3.2 15 0 18" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" />
      <path d="M3 16l5-5 4 4 3-3 6 6" />
    </>
  ),
  grip: (
    <>
      <rect x="9" y="6" width="2" height="2" fill="currentColor" />
      <rect x="13" y="6" width="2" height="2" fill="currentColor" />
      <rect x="9" y="11" width="2" height="2" fill="currentColor" />
      <rect x="13" y="11" width="2" height="2" fill="currentColor" />
      <rect x="9" y="16" width="2" height="2" fill="currentColor" />
      <rect x="13" y="16" width="2" height="2" fill="currentColor" />
    </>
  ),
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  window: (
    <>
      <rect x="3" y="5" width="18" height="14" />
      <path d="M3 9h18" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  )
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof ICONS

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
  filled?: boolean
}

export function Icon({ name, size = 16, filled = false, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {ICONS[name]}
    </svg>
  )
}
