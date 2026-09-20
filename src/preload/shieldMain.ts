/**
 * The page shield: runs inside every web page's own JavaScript world, before the page's scripts (see shield.ts).
 *
 * It must stay one self-contained function — it is serialised and evaluated in the page, so it cannot use imports or
 * anything declared outside of it.
 *
 * What it does, in short: a fingerprinting script reads values that differ from machine to machine (how a canvas is
 * rasterised, how the audio stack rounds, which GPU is installed, how many cores there are, how large the screen is)
 * and turns them into a stable identifier. The shield keeps every such value *stable inside one site and one browser
 * session* — so nothing on the web breaks — but different for every site and every session, so the identifiers of two
 * sites can no longer be matched up. "Strict" additionally reports the same values as every other F2PX user.
 */
export interface ShieldConfig {
  /** `off` still runs the pieces that are not about fingerprints (e.g. cookie blocking in embedded frames). */
  level: 'off' | 'standard' | 'strict'
  /** Secret per site and browser session; every noise pattern derives from it. */
  seed: string
  /** Hide cross-site `document.referrer` (matches the header stripping in the network layer). */
  stripReferrer: boolean
  /** Embedded third-party frame with third-party cookies blocked. */
  blockCookies: boolean
}

export function shieldMain(cfg: ShieldConfig, hit: (kind: string) => void): void {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const strict = cfg.level === 'strict'
  const fingerprint = cfg.level !== 'off'
  const installed = new WeakSet<object>()
  const fakes = new WeakMap<object, string>()

  const reported: Record<string, boolean> = {}
  const report = (kind: string): void => {
    if (reported[kind]) return
    reported[kind] = true
    try {
      hit(kind)
    } catch {
      /* counting is best-effort */
    }
  }

  // ── keep the patched functions looking native ─────────────────────────────
  const named = (fn: any, name: string, length: number, nativeName: string): any => {
    try {
      Object.defineProperty(fn, 'name', { value: name, configurable: true })
      Object.defineProperty(fn, 'length', { value: length, configurable: true })
    } catch {
      /* ignore */
    }
    fakes.set(fn, `function ${nativeName}() { [native code] }`)
    return fn
  }

  const patchMethod = (proto: any, name: string, wrap: (orig: any) => any): void => {
    try {
      if (!proto) return
      const desc = Object.getOwnPropertyDescriptor(proto, name)
      if (!desc || typeof desc.value !== 'function') return
      const orig = desc.value
      Object.defineProperty(proto, name, { ...desc, value: named(wrap(orig), orig.name, orig.length, orig.name) })
    } catch {
      /* a page that froze the prototype simply keeps the native method */
    }
  }

  const patchGetter = (target: any, name: string, make: (origGet: () => any) => () => any): void => {
    try {
      if (!target) return
      const desc = Object.getOwnPropertyDescriptor(target, name)
      if (!desc || typeof desc.get !== 'function') return
      Object.defineProperty(target, name, { ...desc, get: named(make(desc.get), `get ${name}`, 0, `get ${name}`) })
    } catch {
      /* ignore */
    }
  }

  // ── seeded randomness ─────────────────────────────────────────────────────
  const makeRng = (salt: string): (() => number) => {
    const text = `${cfg.seed}|${salt}`
    let h = 1779033703 ^ text.length
    for (let i = 0; i < text.length; i++) {
      h = Math.imul(h ^ text.charCodeAt(i), 3432918353)
      h = (h << 13) | (h >>> 19)
    }
    let a = h >>> 0
    return () => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  /** Flips the lowest bit of a few colour channels: invisible, but it changes every hash of the pixels. */
  const farbleBytes = (data: any, width: number, height: number, salt: string): void => {
    const rng = makeRng(`px${width}x${height}${salt}`)
    const pixels = (data.length / 4) | 0
    let i = (rng() * 48) | 0
    while (i < pixels) {
      const o = i * 4
      if (data[o + 3] !== 0) {
        const ch = (rng() * 3) | 0
        const v = data[o + ch]
        data[o + ch] = rng() < 0.5 ? (v > 0 ? v - 1 : v + 1) : v < 255 ? v + 1 : v - 1
      }
      i += 1 + ((rng() * 96) | 0)
    }
  }

  const farbleFloats = (arr: any, salt: string, magnitude: number): void => {
    const rng = makeRng(`fl${salt}${arr.length}`)
    for (let i = (rng() * 64) | 0; i < arr.length; i += 1 + ((rng() * 128) | 0)) arr[i] += (rng() - 0.5) * magnitude
  }

  const maskGpu = (param: number, value: any): any => {
    if (typeof value !== 'string') return value
    if (strict) {
      return param === 0x9245 ? 'Google Inc. (Google)' : 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'
    }
    // standard: the GPU vendor stays (games need it), the exact model — the identifying part — goes
    if (param === 0x9245) return value
    const m = /^ANGLE \(([^,]+),/.exec(value)
    return m ? `ANGLE (${m[1].trim()}, ${m[1].trim()} Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)` : value
  }

  /**
   * Protects one JavaScript world (`win`). It runs for the page itself, and again for every blank same-origin iframe the
   * page touches — the classic way of getting hold of a pristine copy of the browser functions.
   */
  const install = (win: any): void => {
    if (installed.has(win)) return
    installed.add(win)
    const doc = win.document
    const loc = win.location

    const nativeToString = win.Function.prototype.toString
    const toStringProxy = function toString(this: unknown): string {
      const fake = typeof this === 'function' ? fakes.get(this as object) : undefined
      return fake !== undefined ? fake : nativeToString.call(this)
    }
    fakes.set(toStringProxy, 'function toString() { [native code] }')
    Object.defineProperty(win.Function.prototype, 'toString', { value: toStringProxy, writable: true, configurable: true })

    // ── cookies in embedded frames ──────────────────────────────────────────
    // The network layer already strips cookies from third-party requests; this closes the JavaScript door (document.cookie).
    if (cfg.blockCookies) {
      try {
        const desc = Object.getOwnPropertyDescriptor(win.Document.prototype, 'cookie')
        if (desc && desc.get && desc.set) {
          Object.defineProperty(win.Document.prototype, 'cookie', {
            ...desc,
            get: named(function () { return '' }, 'get cookie', 0, 'get cookie'),
            set: named(function () { /* dropped */ }, 'set cookie', 1, 'set cookie')
          })
        }
      } catch {
        /* ignore */
      }
    }
    if (!fingerprint) return

    // ── canvas ──────────────────────────────────────────────────────────────
    const canvasProto = win.HTMLCanvasElement?.prototype
    const ctx2dProto = win.CanvasRenderingContext2D?.prototype
    const offCtxProto = win.OffscreenCanvasRenderingContext2D?.prototype
    const nativeGetImageData: any = ctx2dProto?.getImageData
    const nativeGetContext: any = canvasProto?.getContext
    const nativeCreateElement: any = win.Document?.prototype?.createElement

    const noisyCopy = (canvas: any): any => {
      try {
        const w = canvas.width
        const h = canvas.height
        if (!(w > 0 && h > 0) || w * h < 16 || w * h > 8_000_000 || !nativeGetImageData || !nativeGetContext || !nativeCreateElement) return null
        const copy = nativeCreateElement.call(doc, 'canvas')
        copy.width = w
        copy.height = h
        const ctx = nativeGetContext.call(copy, '2d')
        if (!ctx) return null
        ctx.drawImage(canvas, 0, 0)
        const image = nativeGetImageData.call(ctx, 0, 0, w, h)
        farbleBytes(image.data, w, h, 'e')
        ctx.putImageData(image, 0, 0)
        return copy
      } catch {
        return null // tainted canvas etc.: let the original call fail (or succeed) exactly as it would have
      }
    }

    const patchGetImageData = (proto: any): void =>
      patchMethod(proto, 'getImageData', (orig) =>
        function (this: any, ...args: any[]) {
          const image = orig.apply(this, args)
          try {
            if (image && image.width * image.height >= 16) {
              report('canvas')
              farbleBytes(image.data, image.width, image.height, 'g')
            }
          } catch {
            /* ignore */
          }
          return image
        }
      )
    patchGetImageData(ctx2dProto)
    patchGetImageData(offCtxProto)

    patchMethod(canvasProto, 'toDataURL', (orig) =>
      function (this: any, ...args: any[]) {
        report('canvas')
        return orig.apply(noisyCopy(this) ?? this, args)
      }
    )
    patchMethod(canvasProto, 'toBlob', (orig) =>
      function (this: any, ...args: any[]) {
        report('canvas')
        return orig.apply(noisyCopy(this) ?? this, args)
      }
    )
    patchMethod(win.OffscreenCanvas?.prototype, 'convertToBlob', (orig) =>
      function (this: any, ...args: any[]) {
        report('canvas')
        try {
          const w = this.width
          const h = this.height
          if (w * h >= 16 && w * h <= 8_000_000) {
            const copy = new win.OffscreenCanvas(w, h)
            const ctx = copy.getContext('2d')
            ctx.drawImage(this, 0, 0)
            const image = ctx.getImageData(0, 0, w, h)
            farbleBytes(image.data, w, h, 'o')
            ctx.putImageData(image, 0, 0)
            return orig.apply(copy, args)
          }
        } catch {
          /* fall through to the original */
        }
        return orig.apply(this, args)
      }
    )

    // ── WebGL ───────────────────────────────────────────────────────────────
    for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
      const proto = win[name]?.prototype
      patchMethod(proto, 'getParameter', (orig) =>
        function (this: any, param: number) {
          const value = orig.call(this, param)
          if (param === 0x9245 || param === 0x9246) {
            report('webgl')
            return maskGpu(param, value)
          }
          return value
        }
      )
      patchMethod(proto, 'readPixels', (orig) =>
        function (this: any, ...args: any[]) {
          const result = orig.apply(this, args)
          try {
            const pixels = args[6]
            if (pixels && pixels.BYTES_PER_ELEMENT === 1 && args[4] === 0x1908 && args[2] * args[3] >= 16) {
              report('webgl')
              farbleBytes(pixels, args[2], args[3], 'r')
            }
          } catch {
            /* ignore */
          }
          return result
        }
      )
    }

    // ── audio ───────────────────────────────────────────────────────────────
    const farbledChannels = new WeakMap<object, Record<number, boolean>>()
    patchMethod(win.AudioBuffer?.prototype, 'getChannelData', (orig) =>
      function (this: any, channel: number) {
        const data = orig.call(this, channel)
        try {
          report('audio')
          let done = farbledChannels.get(this)
          if (!done) farbledChannels.set(this, (done = {}))
          if (!done[channel]) {
            done[channel] = true
            farbleFloats(data, `c${channel}`, 2e-6)
          }
        } catch {
          /* ignore */
        }
        return data
      }
    )
    patchMethod(win.AudioBuffer?.prototype, 'copyFromChannel', (orig) =>
      function (this: any, ...args: any[]) {
        const result = orig.apply(this, args)
        try {
          report('audio')
          if (args[0] && args[0].length) farbleFloats(args[0], `f${args[1]}`, 2e-6)
        } catch {
          /* ignore */
        }
        return result
      }
    )
    for (const method of ['getFloatFrequencyData', 'getFloatTimeDomainData']) {
      patchMethod(win.AnalyserNode?.prototype, method, (orig) =>
        function (this: any, array: any) {
          const result = orig.call(this, array)
          try {
            report('audio')
            farbleFloats(array, method, 0.02)
          } catch {
            /* ignore */
          }
          return result
        }
      )
    }
    for (const method of ['getByteFrequencyData', 'getByteTimeDomainData']) {
      patchMethod(win.AnalyserNode?.prototype, method, (orig) =>
        function (this: any, array: any) {
          const result = orig.call(this, array)
          try {
            report('audio')
            const rng = makeRng(`by${method}${array.length}`)
            for (let i = (rng() * 32) | 0; i < array.length; i += 1 + ((rng() * 64) | 0)) array[i] = Math.max(0, Math.min(255, array[i] + (rng() < 0.5 ? -1 : 1)))
          } catch {
            /* ignore */
          }
          return result
        }
      )
    }

    // ── hardware ────────────────────────────────────────────────────────────
    const navProto = win.Navigator?.prototype
    const realCores: number = win.navigator.hardwareConcurrency || 4
    const cores = strict ? 4 : realCores >= 8 ? 8 : realCores >= 4 ? 4 : 2
    patchGetter(navProto, 'hardwareConcurrency', () => function () { return cores })
    if (strict) patchGetter(navProto, 'deviceMemory', () => function () { return 8 })

    if (strict) {
      // Things that describe the machine but that almost no site needs.
      try {
        delete navProto.getBattery
      } catch {
        /* ignore */
      }
      patchGetter(navProto, 'connection', () => function () { return undefined })
      patchMethod(navProto, 'getGamepads', () => function () { return [] })
      patchMethod(win.MediaDevices?.prototype, 'enumerateDevices', () =>
        function () {
          report('devices')
          return Promise.resolve([])
        }
      )
      patchMethod(win.SpeechSynthesis?.prototype, 'getVoices', () =>
        function () {
          report('voices')
          return []
        }
      )

      // The screen is reported as the size of the window (rounded up), so the display itself stays private.
      const up = (v: number): number => Math.max(100, Math.ceil(v / 100) * 100)
      const screenProto = win.Screen?.prototype
      patchGetter(screenProto, 'width', () => function () { return up(win.innerWidth) })
      patchGetter(screenProto, 'height', () => function () { return up(win.innerHeight) })
      patchGetter(screenProto, 'availWidth', () => function () { return up(win.innerWidth) })
      patchGetter(screenProto, 'availHeight', () => function () { return up(win.innerHeight) })
      patchGetter(screenProto, 'availLeft', () => function () { return 0 })
      patchGetter(screenProto, 'availTop', () => function () { return 0 })
      patchGetter(screenProto, 'colorDepth', () => function () { return 24 })
      patchGetter(screenProto, 'pixelDepth', () => function () { return 24 })
      patchGetter(win, 'outerWidth', () => function () { return win.innerWidth })
      patchGetter(win, 'outerHeight', () => function () { return win.innerHeight })
      for (const name of ['screenX', 'screenY', 'screenLeft', 'screenTop']) patchGetter(win, name, () => function () { return 0 })

      // Timing side channels get a little coarser.
      patchMethod(win.Performance?.prototype, 'now', (orig) =>
        function (this: any) {
          return Math.round(orig.call(this))
        }
      )
    }

    // ── referrer ────────────────────────────────────────────────────────────
    if (cfg.stripReferrer) {
      const site = (host: string): string => host.split('.').slice(-2).join('.')
      patchGetter(win.Document?.prototype, 'referrer', (orig) =>
        function (this: any) {
          const value: string = orig.call(this)
          if (!value) return value
          try {
            return site(new URL(value).hostname) === site(loc.hostname) ? value : ''
          } catch {
            return ''
          }
        }
      )
    }

    // ── blank iframes ───────────────────────────────────────────────────────
    // A script can create an empty same-origin frame and take pristine copies of the functions patched above out of it.
    // Frames with an address load their own document and get the shield from the browser; the blank ones are handled here.
    for (const name of ['contentWindow', 'contentDocument']) {
      patchGetter(win.HTMLIFrameElement?.prototype, name, (orig) =>
        function (this: any) {
          const value = orig.call(this)
          try {
            const target = name === 'contentWindow' ? value : value?.defaultView
            if (target && !installed.has(target)) install(target)
          } catch {
            /* cross-origin frame: it has the shield of its own */
          }
          return value
        }
      )
    }
  }

  install(globalThis)
}
