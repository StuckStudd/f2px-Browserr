import type { Bookmark } from '../../shared/types'

/** Import/export of the Netscape bookmark file format used by Chrome, Edge and Firefox. */

export interface ImportedNode {
  type: 'bookmark' | 'folder'
  title: string
  url: string
  /** Index of the parent folder in the returned array, or null for top level. */
  parent: number | null
}

const decodeEntities = (s: string): string =>
  s
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/gi, '&')

const encodeEntities = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function parseNetscape(html: string): ImportedNode[] {
  const nodes: ImportedNode[] = []
  const stack: (number | null)[] = [null]
  let pendingFolder: number | null = null
  const token = /<(\/?)(DL|H3|A)\b([^>]*)>([^<]*)/gi

  for (const match of html.matchAll(token)) {
    const closing = match[1] === '/'
    const tag = match[2].toUpperCase()
    const attrs = match[3]
    const text = decodeEntities(match[4]).trim()

    if (tag === 'H3' && !closing) {
      nodes.push({ type: 'folder', title: text || 'Folder', url: '', parent: stack[stack.length - 1] })
      pendingFolder = nodes.length - 1
    } else if (tag === 'DL') {
      if (closing) {
        if (stack.length > 1) stack.pop()
      } else {
        stack.push(pendingFolder ?? stack[stack.length - 1])
        pendingFolder = null
      }
    } else if (tag === 'A' && !closing) {
      const href = /HREF="([^"]*)"/i.exec(attrs)?.[1]
      if (href) {
        nodes.push({ type: 'bookmark', title: text || href, url: decodeEntities(href), parent: stack[stack.length - 1] })
      }
    }
  }
  return nodes
}

export function exportNetscape(all: Bookmark[]): string {
  const children = (parent: string | null): Bookmark[] =>
    all.filter((b) => b.parentId === parent).sort((a, b) => a.position - b.position)

  const render = (parent: string | null, depth: number): string => {
    const pad = '    '.repeat(depth)
    return children(parent)
      .map((b) =>
        b.type === 'folder'
          ? `${pad}<DT><H3>${encodeEntities(b.title)}</H3>\n${pad}<DL><p>\n${render(b.id, depth + 1)}${pad}</DL><p>\n`
          : `${pad}<DT><A HREF="${encodeEntities(b.url)}" ADD_DATE="${Math.floor(b.createdAt / 1000)}">${encodeEntities(b.title)}</A>\n`
      )
      .join('')
  }

  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- Exported by F2PX Browser -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${render(null, 1)}</DL><p>
`
}
