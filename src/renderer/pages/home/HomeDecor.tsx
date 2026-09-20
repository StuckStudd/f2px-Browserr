/** Barely-there technical structure behind the logo: concentric rings, axes, tick marks. */
export function HomeDecor() {
  const ticks = Array.from({ length: 72 }, (_, i) => i)
  return (
    <svg className="home__decor" viewBox="-500 -500 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1">
        <circle r="150" opacity=".5" />
        <circle r="260" opacity=".4" strokeDasharray="2 10" />
        <circle r="380" opacity=".35" />
        <circle r="470" opacity=".2" />
        <path d="M-500 0H-120M120 0H500M0 -500V-120M0 120V500" opacity=".5" />
        <path d="M-353 -353L-96 -96M96 96L353 353M353 -353L96 -96M-96 96L-353 353" opacity=".22" />
        {ticks.map((i) => {
          const a = (i / 72) * Math.PI * 2
          const long = i % 6 === 0
          const r1 = 380
          const r2 = long ? 396 : 388
          return (
            <line
              key={i}
              x1={Math.cos(a) * r1}
              y1={Math.sin(a) * r1}
              x2={Math.cos(a) * r2}
              y2={Math.sin(a) * r2}
              opacity={long ? 0.7 : 0.35}
            />
          )
        })}
      </g>
    </svg>
  )
}
