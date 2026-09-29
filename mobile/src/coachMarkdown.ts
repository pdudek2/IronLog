export type MarkdownBlock = { kind: 'paragraph' | 'heading' | 'item'; text: string; level: number; marker?: string }
export function markdownBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  let paragraph: string[] = []
  let list: 'ordered' | 'unordered' | null = null
  let ordinal = 0
  const flush = () => { if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join('\n'), level: 0 }); paragraph = [] }
  for (const line of content.replace(/\r\n/g, '\n').trim().split('\n')) {
    if (!line.trim()) { flush(); list = null; continue }
    const heading = line.trim().match(/^(#{1,3})\s+(.*)$/)
    const item = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/)
    if (heading) { flush(); list = null; blocks.push({ kind: 'heading', text: heading[2], level: heading[1].length }) }
    else if (item) {
      flush(); const kind = /\d/.test(item[2]) ? 'ordered' : 'unordered'
      ordinal = list === kind ? ordinal + 1 : 1; list = kind
      blocks.push({ kind: 'item', text: item[3].trim(), level: Math.floor(item[1].length / 2), marker: kind === 'ordered' ? `${ordinal}.` : '•' })
    } else if (/^\s{2,}/.test(line) && list && blocks.at(-1)?.kind === 'item') blocks[blocks.length - 1].text += `\n${line.trim()}`
    else { list = null; paragraph.push(line.trim()) }
  }
  flush(); return blocks
}
export function markdownInline(text: string): { text: string; kind: 'text' | 'code' | 'bold' | 'italic' }[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|(?<!\*)\*[^*\n]+\*(?!\*)|(?<!_)_[^_\n]+_(?!_))/g).filter(Boolean).map(part => {
    if (part.startsWith('`') && part.endsWith('`')) return { text: part.slice(1,-1), kind: 'code' }
    if (/^(\*\*|__)/.test(part)) return { text: part.slice(2,-2), kind: 'bold' }
    if (/^([*_]).+\1$/.test(part) && part.length > 2) return { text: part.slice(1,-1), kind: 'italic' }
    return { text: part, kind: 'text' }
  })
}
