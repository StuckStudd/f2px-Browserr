/** `1.2.10` > `1.2.9`; anything that is not plain x.y.z is treated as "not newer". */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (v: string): number[] | null => (/^\d+\.\d+\.\d+$/.test(v) ? v.split('.').map(Number) : null)
  const a = parse(candidate)
  const b = parse(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}
