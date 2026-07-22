import { createServer } from 'node:http'
import aiChatHandler from '../api/ai-chat.ts'
import aiModelsHandler from '../api/ai-models.ts'
import deleteWorkoutHandler from '../api/delete-workout.ts'
import discardSessionHandler from '../api/discard-session.ts'
import finalizeWorkoutHandler from '../api/finalize-workout.ts'
import materializeWorkoutHandler from '../api/materialize-workout.ts'
import updateWorkoutHandler from '../api/update-workout.ts'
import { sendJson, type ApiRequest, type ApiResponse } from '../api/lib/http.ts'

type RouteHandler = (req: ApiRequest, res: ApiResponse) => Promise<void>

const routes = new Map<string, RouteHandler>([
  ['/api/ai-chat', aiChatHandler],
  ['/api/ai-models', aiModelsHandler],
  ['/api/delete-workout', deleteWorkoutHandler],
  ['/api/discard-session', discardSessionHandler],
  ['/api/finalize-workout', finalizeWorkoutHandler],
  ['/api/materialize-workout', materializeWorkoutHandler],
  ['/api/update-workout', updateWorkoutHandler],
])

function applyCors(req: ApiRequest, res: ApiResponse) {
  const origin = req.headers.origin
  if (!origin) return

  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Expose-Headers', 'X-IronLog-AI-Context')
  }
}

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url ?? '/', 'http://localhost:3000').pathname.replace(/\/+$/, '') || '/'
  const handler = routes.get(pathname)
  const apiReq = req as ApiRequest
  const apiRes = res as ApiResponse

  console.log(`[dev api] ${req.method ?? 'GET'} ${pathname}`)

  applyCors(apiReq, apiRes)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (!handler) {
    console.warn(`[dev api] 404 for ${req.method ?? 'GET'} ${pathname}`)
    sendJson(apiRes, 404, { error: `Nie znaleziono lokalnego endpointu ${pathname}.` })
    return
  }

  try {
    await handler(apiReq, apiRes)
  } catch (error) {
    console.error('[dev api server error]', error)
    if (!res.headersSent) {
      sendJson(apiRes, 500, { error: 'Lokalny serwer API zwrócił nieoczekiwany błąd.' })
    } else {
      res.end()
    }
  }
})

server.listen(3000, () => {
  console.log('Local API server ready at http://localhost:3000')
  console.log(`Routes: ${[...routes.keys()].join(', ')}`)
})

function shutdown() {
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
