import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024
const MAX_EXTRACTED_CHARS = 100_000
const MAX_REDIRECTS = 5

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
type LookupLike = (hostname: string) => Promise<Array<{ address: string }>>

export interface UrlContent {
  title: string
  finalUrl: string
  text: string
}

export interface ProfileUrlReader {
  read(url: string): Promise<UrlContent>
}

const decodeEntities = (value: string): string => value.replace(
  /&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi,
  (entity, code: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
    const normalized = code.toLowerCase()
    if (named[normalized]) return named[normalized]
    const radix = normalized.startsWith('#x') ? 16 : 10
    const digits = normalized.replace(/^#x?/, '')
    const point = Number.parseInt(digits, radix)
    return Number.isFinite(point) ? String.fromCodePoint(point) : entity
  }
)

const stripTags = (value: string): string => decodeEntities(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

export const htmlToReadableText = (html: string): { title: string; text: string } => {
  const title = stripTags(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
  const withAltText = html.replace(/<img\b[^>]*\balt\s*=\s*(["'])(.*?)\1[^>]*>/gis, '\n$2\n')
  const withoutNoise = withAltText
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|svg|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  const withLines = withoutNoise
    .replace(/<\/(address|article|aside|blockquote|dd|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)>/gi, '\n')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
  const text = decodeEntities(withLines.replace(/<[^>]+>/g, ' '))
    .split(/\r?\n/)
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .filter(Boolean)
    .filter((line, index, lines) => index === 0 || line !== lines[index - 1])
    .join('\n')
    .slice(0, MAX_EXTRACTED_CHARS)
  return { title, text }
}

const isPrivateIpv4 = (address: string): boolean => {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
}

export const isPublicIp = (address: string): boolean => {
  const normalized = address.toLowerCase().split('%')[0]
  if (isIP(normalized) === 4) return !isPrivateIpv4(normalized)
  if (isIP(normalized) !== 6) return false
  if (normalized.startsWith('::ffff:')) return isPublicIp(normalized.slice(7))
  return normalized !== '::' && normalized !== '::1' &&
    !normalized.startsWith('fc') && !normalized.startsWith('fd') &&
    !/^fe[89ab]/.test(normalized) && !normalized.startsWith('2001:db8:')
}

const defaultLookup: LookupLike = async (hostname) => lookup(hostname, { all: true, verbatim: true })

export class PublicUrlReader implements ProfileUrlReader {
  constructor(
    private readonly fetchImpl: FetchLike = globalThis.fetch,
    private readonly lookupImpl: LookupLike = defaultLookup
  ) {}

  private async assertPublic(url: URL): Promise<void> {
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('공개 HTTP(S) URL만 사용할 수 있습니다.')
    if (url.username || url.password) throw new Error('인증 정보가 포함된 URL은 사용할 수 없습니다.')
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      throw new Error('로컬 네트워크 URL은 사용할 수 없습니다.')
    }
    const addresses = isIP(hostname) ? [{ address: hostname }] : await this.lookupImpl(hostname)
    if (!addresses.length || addresses.some(({ address }) => !isPublicIp(address))) throw new Error('공개 인터넷 주소만 사용할 수 있습니다.')
  }

  async read(rawUrl: string): Promise<UrlContent> {
    let current = new URL(rawUrl)
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      await this.assertPublic(current)
      const response = await this.fetchImpl(current.toString(), {
        method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(20_000),
        headers: {
          accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
          'accept-language': 'ko-KR,ko;q=0.9,en;q=0.7',
          'user-agent': 'InterviewStudio/0.1 (+local profile importer)'
        }
      })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) throw new Error(`리디렉션 위치가 없습니다. (HTTP ${response.status})`)
        if (redirect === MAX_REDIRECTS) throw new Error('URL 리디렉션이 너무 많습니다.')
        current = new URL(location, current)
        continue
      }
      if (!response.ok) throw new Error(`페이지를 읽지 못했습니다. (HTTP ${response.status})`)
      const declaredSize = Number(response.headers.get('content-length') ?? 0)
      if (declaredSize > MAX_DOWNLOAD_BYTES) throw new Error('페이지 용량이 5MB를 초과합니다.')
      const bytes = await response.arrayBuffer()
      if (bytes.byteLength > MAX_DOWNLOAD_BYTES) throw new Error('페이지 용량이 5MB를 초과합니다.')
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml') && !contentType.includes('text/plain')) {
        throw new Error(`지원하지 않는 URL 콘텐츠 형식입니다: ${contentType || '알 수 없음'}`)
      }
      const decoded = new TextDecoder('utf-8').decode(bytes)
      const extracted = contentType.includes('text/plain')
        ? { title: '', text: decoded.replace(/\r\n/g, '\n').trim().slice(0, MAX_EXTRACTED_CHARS) }
        : htmlToReadableText(decoded)
      if (extracted.text.replace(/\s/g, '').length < 80) throw new Error('페이지에서 읽을 수 있는 본문을 찾지 못했습니다.')
      return { title: extracted.title || current.hostname, finalUrl: current.toString(), text: extracted.text }
    }
    throw new Error('URL을 읽지 못했습니다.')
  }
}
