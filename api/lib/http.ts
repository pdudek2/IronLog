import type { IncomingMessage, ServerResponse } from 'node:http'

export interface ApiRequest extends IncomingMessage {
  body?: unknown
}

export type ApiResponse = ServerResponse

export function sendJson(res: ApiResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export async function readJsonBody<T>(req: ApiRequest): Promise<T> {
  if (req.body !== undefined) return parseKnownBody(req.body) as T

  let raw = ''
  for await (const chunk of req) raw += chunk.toString()

  if (!raw) return {} as T

  try {
    return JSON.parse(raw) as T
  } catch {
    throw new Error('Niepoprawny JSON w body requestu.')
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
  if (typeof body === 'string') return body ? JSON.parse(body) : {}
  if (Buffer.isBuffer(body)) return body.length ? JSON.parse(body.toString('utf8')) : {}
  return body
}
