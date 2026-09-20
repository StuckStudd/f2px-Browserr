/** The F2PX mark: crosshair "X" inside corner brackets. */
export function LogoMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" aria-hidden="true" focusable="false">
      <path
        d="M54 88V54h34M202 88V54h-34M54 168v34h34M202 168v34h-34"
        fill="none"
        stroke="currentColor"
        strokeWidth="16"
        strokeLinecap="square"
      />
      <path
        d="M90 90l26 26M140 140l26 26M166 90l-26 26M116 140l-26 26"
        fill="none"
        stroke="currentColor"
        strokeWidth="26"
        strokeLinecap="square"
      />
      <rect x="119" y="119" width="18" height="18" fill="currentColor" />
    </svg>
  )
}
