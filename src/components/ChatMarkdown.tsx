type ChatMarkdownProps = {
  content: string
}

type ListKind = 'ul' | 'ol'

type ListItem = {
  contentHtml: string
  indent: number
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatInlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em>$1</em>')
}

function renderChatMarkdown(content: string) {
  const normalized = content.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''

  const htmlParts: string[] = []
  const paragraphLines: string[] = []
  let currentListType: ListKind | null = null
  let currentListItems: ListItem[] = []

  function flushParagraph() {
    if (paragraphLines.length === 0) return

    htmlParts.push(
      `<p>${paragraphLines.map((line) => formatInlineMarkdown(line.trim())).join('<br />')}</p>`,
    )
    paragraphLines.length = 0
  }

  function flushList() {
    if (!currentListType || currentListItems.length === 0) return

    htmlParts.push(
      `<${currentListType}>${currentListItems
        .map((item) => {
          const offset = item.indent > 0 ? ` style="margin-left:${item.indent * 1.1}rem"` : ''
          return `<li${offset}>${item.contentHtml}</li>`
        })
        .join('')}</${currentListType}>`,
    )

    currentListType = null
    currentListItems = []
  }

  for (const line of normalized.split('\n')) {
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      flushList()
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/)
    if (headingMatch) {
      flushParagraph()
      flushList()

      const level = Math.min(3, headingMatch[1].length)
      htmlParts.push(`<h${level}>${formatInlineMarkdown(headingMatch[2])}</h${level}>`)
      continue
    }

    const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/)
    if (listMatch) {
      flushParagraph()

      const nextListType: ListKind = /\d+\./.test(listMatch[2]) ? 'ol' : 'ul'
      if (currentListType && currentListType !== nextListType) {
        flushList()
      }

      currentListType = nextListType
      currentListItems.push({
        contentHtml: formatInlineMarkdown(listMatch[3].trim()),
        indent: Math.floor(listMatch[1].length / 2),
      })
      continue
    }

    const continuationMatch = line.match(/^\s{2,}(.*)$/)
    if (continuationMatch && currentListType && currentListItems.length > 0) {
      currentListItems[currentListItems.length - 1].contentHtml += `<br />${formatInlineMarkdown(
        continuationMatch[1].trim(),
      )}`
      continue
    }

    flushList()
    paragraphLines.push(line)
  }

  flushParagraph()
  flushList()

  return htmlParts.join('')
}

export default function ChatMarkdown({ content }: ChatMarkdownProps) {
  return (
    <div
      className="chat-markdown text-sm leading-6 text-white"
      dangerouslySetInnerHTML={{ __html: renderChatMarkdown(content) }}
    />
  )
}
