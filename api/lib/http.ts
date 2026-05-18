import type { IncomingMessage, ServerResponse } from 'node:http'

import { ApiError, isApiError } from './errors.js'

export interface ApiRequest extends IncomingMessage {
  body?: unknown
}

export type ApiResponse = ServerResponse

export interface ReadJsonBodyOptions {
  maxBytes?: number
  requireJsonContentType?: boolean
}

interface SendApiErrorOptions {
  fallbackMessage: string
  fallbackStatus?: number
}

const DEFAULT_MAX_BODY_BYTES = 64 * 1024

export function sendJson(res: ApiResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function sendApiError(
  res: ApiResponse,
  error: unknown,
  { fallbackMessage, fallbackStatus = 400 }: SendApiErrorOptions,
): void {
  if (isApiError(error)) {
    sendJson(res, error.status, { error: error.message })
    return
  }

  const message = error instanceof Error && error.message ? error.message : fallbackMessage
  sendJson(res, fallbackStatus, { error: message })
}

export async function readJsonBody<T>(
  req: ApiRequest,
  options: ReadJsonBodyOptions = {},
): Promise<T> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BODY_BYTES
  const requireJsonContentType = options.requireJsonContentType ?? true
  const contentType = getHeader(req, 'content-type')

  if (contentType && requireJsonContentType && !isJsonContentType(contentType)) {
    throw new ApiError(415, 'Content-Type musi być application/json.')
  }

  if (req.body !== undefined) {
    if (requireJsonContentType && !contentType && hasKnownBodyContent(req.body)) {
      throw new ApiError(415, 'Content-Type musi być application/json.')
    }

    assertKnownBodySize(req.body, maxBytes)
    return parseKnownBody(req.body) as T
  }

  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    size += buffer.length

    if (size > maxBytes) {
      req.destroy()
      throw new ApiError(413, 'Body requestu jest zbyt duże.')
    }

    chunks.push(buffer)
  }

  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {} as T

  if (requireJsonContentType && !contentType) {
    throw new ApiError(415, 'Content-Type musi być application/json.')
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    throw new ApiError(400, 'Niepoprawny JSON w body requestu.')
  }
}

export function getBearerToken(req: ApiRequest): string | null {
  const header = req.headers.authorization
  if (!header) return null

  const [scheme, token] = header.split(' ')
  if (scheme !== 'Bearer' || !token) return null

  return token
}

function parseKnownBody(body: unknown): unknown {
  try {
    if (typeof body === 'string') return body ? JSON.parse(body) : {}
    if (Buffer.isBuffer(body)) return body.length ? JSON.parse(body.toString('utf8')) : {}
  } catch {
    throw new ApiError(400, 'Niepoprawny JSON w body requestu.')
  }

  return body
}

function assertKnownBodySize(body: unknown, maxBytes: number): void {
  const size = estimateKnownBodySize(body)
  if (size > maxBytes) throw new ApiError(413, 'Body requestu jest zbyt duże.')
}

function estimateKnownBodySize(body: unknown): number {
  if (typeof body === 'string') return Buffer.byteLength(body, 'utf8')
  if (Buffer.isBuffer(body)) return body.length
  if (body === undefined || body === null) return 0
  return Buffer.byteLength(JSON.stringify(body), 'utf8')
}

function hasKnownBodyContent(body: unknown): boolean {
  if (typeof body === 'string') return body.length > 0
  if (Buffer.isBuffer(body)) return body.length > 0
  if (body === undefined || body === null) return false
  return true
}

function getHeader(req: ApiRequest, name: string): string | null {
  const value = req.headers[name]
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value[0] ?? null
  return null
}

function isJsonContentType(contentType: string): boolean {
  const normalized = contentType.split(';', 1)[0]?.trim().toLowerCase()
  if (!normalized) return false
  return normalized === 'application/json'
    || (normalized.startsWith('application/') && normalized.endsWith('+json'))
}
