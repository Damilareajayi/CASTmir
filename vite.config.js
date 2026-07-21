import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      {
        name: 'prism-anthropic-proxy',
        configureServer(server) {
          server.middlewares.use('/api/coach', (req, res) => {
            if (req.method !== 'POST') { res.statusCode = 405; return res.end() }
            const key = env.ANTHROPIC_API_KEY
            if (!key) {
              res.statusCode = 503
              res.setHeader('Content-Type', 'application/json')
              return res.end(JSON.stringify({ error: 'Add ANTHROPIC_API_KEY to your .env file to enable COACH.' }))
            }
            let body = ''
            req.on('data', c => (body += c))
            req.on('end', async () => {
              try {
                const { system, user, max_tokens = 900 } = JSON.parse(body)
                const r = await fetch('https://api.anthropic.com/v1/messages', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': key,
                    'anthropic-version': '2023-06-01',
                  },
                  body: JSON.stringify({
                    model: 'claude-sonnet-4-6',
                    max_tokens,
                    system,
                    messages: [{ role: 'user', content: user }],
                  }),
                })
                const data = await r.json()
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify(data))
              } catch (e) {
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: e.message }))
              }
            })
          })
        },
      },
    ],
    server: { port: 5173 },
  }
})
