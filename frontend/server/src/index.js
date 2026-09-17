const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express()
const port = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', message: 'MedVault API is running' })
})

app.listen(port, () => {
  console.log(`MedVault API listening on http://localhost:${port}`)
})
