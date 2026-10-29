import cors from 'cors'
import express from 'express'
import play from 'play-dl'

const app = express()
const PORT = Number(process.env.PORT) || 3001

app.use(cors())

app.get('/api/stream', async (req, res) => {
  try {
    const query = req.query.query

    if (!query || typeof query !== 'string' || !query.trim()) {
      res.status(400).json({ error: 'Parâmetro query é obrigatório' })
      return
    }

    const results = await play.search(query.trim(), {
      limit: 1,
      source: { youtube: 'video' },
    })

    const firstResult = Array.isArray(results) ? results[0] : undefined

    if (!firstResult?.id) {
      res.status(404).json({ error: 'Vídeo não encontrado' })
      return
    }

    res.json({
      videoId: firstResult.id,
      title: firstResult.title,
    })
  } catch (error) {
    console.error('Erro detalhado:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Falha ao resolver vídeo' })
    }
  }
})

app.listen(PORT, () => {
  console.log(`Azuri resolve server em http://localhost:${PORT}`)
})
