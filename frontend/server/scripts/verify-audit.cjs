const { createApp } = require('../src/index')
createApp().then(async ({ db }) => {
  try {
    const result = await db.verifyAudit()
    console.log(JSON.stringify(result, null, 2))
    if (!result.valid) process.exitCode = 1
  } finally { await db.close() }
}).catch(error => { console.error(error.message); process.exitCode = 1 })
