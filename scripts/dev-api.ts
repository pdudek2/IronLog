import { createServer } from 'node:http'
import aiChatHandler from '../api/ai-chat.ts'
import aiModelsHandler from '../api/ai-models.ts'
import deleteWorkoutHandler from '../api/delete-workout.ts'
import discardSessionHandler from '../api/discard-session.ts'
import finalizeWorkoutHandler from '../api/finalize-workout.ts'
import sessionLaunchOutcomeHandler from '../api/session-launch-outcome.ts'
import materializeWorkoutHandler from '../api/materialize-workout.ts'
import saveTemplateHandler from '../api/save-template.ts'
import createExerciseHandler from '../api/create-exercise.ts'
import updateWorkoutHandler from '../api/update-workout.ts'
import { sendJson, type ApiRequest, type ApiResponse } from '../api/_lib/http.ts'

type RouteHandler = (req: ApiRequest, res: ApiResponse) => Promise<void>

const routes = new Map<string, RouteHandler>([
  ['/api/ai-chat', aiChatHandler],
  ['/api/ai-models', aiModelsHandler],
  ['/api/delete-workout', deleteWorkoutHandler],
  ['/api/discard-session', discardSessionHandler],
  ['/api/finalize-workout', finalizeWorkoutHandler],
  ['/api/session-launch-outcome', sessionLaunchOutcomeHandler],
  ['/api/materialize-workout', materializeWorkoutHandler],
  ['/api/save-template', saveTemplateHandler],
  ['/api/create-exercise', createExerciseHandler],
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

const port = Number(process.env.IRONLOG_API_PORT ?? 3000)
server.listen(port, () => {
  console.log(`Local API server ready at http://localhost:${port}`)
  console.log(`Routes: ${[...routes.keys()].join(', ')}`)
})

function shutdown() {
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
