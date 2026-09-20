// Tiny CDP helper for driving the running F2PX app (Node 24 has a global WebSocket).
const port = () => process.env.PORT || 9333

export async function targets() {
  const res = await fetch(`http://127.0.0.1:${port()}/json/list`)
  return res.json()
}

export async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  let id = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    }
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const myId = ++id
      // A target that disappears mid-call (window closed, app quit) must fail the check instead of hanging the run.
      const timer = setTimeout(() => {
        pending.delete(myId)
        reject(new Error(`CDP timeout: ${method}`))
      }, 60000)
      pending.set(myId, { resolve: (v) => { clearTimeout(timer); resolve(v) }, reject: (e) => { clearTimeout(timer); reject(e) } })
      ws.send(JSON.stringify({ id: myId, method, params }))
    })
  return {
    send,
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
      return r.result.value
    },
    async shot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' })
      const { writeFileSync } = await import('node:fs')
      writeFileSync(file, Buffer.from(r.data, 'base64'))
    },
    close: () => ws.close()
  }
}

export async function find(pred) {
  const list = await targets()
  return list.find(pred)
}

export const isShell = (t) => t.url.includes('/out/renderer/index.html') || /localhost:\d+\/index\.html/.test(t.url)
export const isInternal = (t) => t.url.startsWith('f2px://')
