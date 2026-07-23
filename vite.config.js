import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const region  = env.AWS_REGION || 'us-east-1'
  const modelId = env.BEDROCK_MODEL_ID || 'us.anthropic.claude-haiku-4-5-20251001-v1:0'

  return {
    plugins: [
      react(),
      {
        name: 'prism-bedrock-proxy',
        configureServer(server) {
          server.middlewares.use('/api/coach', (req, res) => {
            if (req.method !== 'POST') { res.statusCode = 405; return res.end() }
            let body = ''
            req.on('data', c => (body += c))
            req.on('end', async () => {
              try {
                const { system, user, max_tokens = 900 } = JSON.parse(body)
                const client = new BedrockRuntimeClient({ region })
                const result = await client.send(new ConverseCommand({
                  modelId,
                  system: [{ text: system }],
                  messages: [{ role: 'user', content: [{ text: user }] }],
                  inferenceConfig: { maxTokens: max_tokens },
                }))
                const text = result.output?.message?.content?.[0]?.text || ''
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ content: [{ type: 'text', text }] }))
              } catch (e) {
                const hint = /credentials/i.test(e.message)
                  ? 'AWS credentials not found. Run `aws configure` or `aws login` on this machine to enable COACH.'
                  : e.message
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: hint }))
              }
            })
          })
        },
      },
    ],
    server: { port: 5173 },
  }
})
