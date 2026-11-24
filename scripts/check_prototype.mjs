#!/usr/bin/env node
/**
 * check_prototype.mjs — 原型可验证门（GitHub issue #19 / internal issue-14）。零依赖，
 * 只用 node:* stdlib（fs / os / path / process / url / child_process）。
 *
 * 把「原型交付 = 可跑 + 有证据」变成确定性断言：
 *   - 静态层（常开、离线、无 Chrome、无第三方依赖）：P1–P6 六条规则；
 *   - 运行时层（--browser，可选）：起 headless Chrome，用 CDP（Node>=22 全局 WebSocket）
 *     在 1440/768/390 三档截图 + 收 console error + 校验五态开关 + 无横向溢出。
 *
 * 用法：
 *   node scripts/check_prototype.mjs <prototype-dir> [--html index.html] [--out <dir>]
 *   node scripts/check_prototype.mjs <prototype-dir> --browser [--widths 1440,768,390] [--chrome <path>]
 *   node scripts/check_prototype.mjs --self-test
 *
 * 退出码：
 *   0 = 通过（含「运行时层未请求」）
 *   1 = 任一断言失败（逐条打印 `rule-id ✗ 说明（文件:行）`）
 *   2 = SKIP：`--browser` 被请求但找不到 Chrome（语义同 scripts/check_pack.mjs:28 的 SKIP；
 *       人工验收时必须原样转述 SKIP — 「没跑」与「跑了通过」不得混为一谈）
 *
 * 静态规则（常开，6 条）：
 *   P1 external-url     全文不出现 http:// / https://（白名单 http://www.w3.org/ 的 XML 命名空间）、
 *                       不出现 @import、url() 里不出现带协议或协议相对的外链
 *   P2 external-img     <img>/<source> 的 src/srcset 不含 http(s)://、不含 // 协议相对地址
 *   P3 hex-outside-root 去掉所有 :root { … } 块后，裸 hex (#rgb/#rrggbb/#rrggbbaa) ≤ 12 个
 *   P4 emoji-icon       全文不出现 \p{Extended_Pictographic}（--allow-emoji 可放行，须在交付说明写理由）
 *   P5 od-id            data-od-id 出现 ≥1 次且值不重复；每个顶层 header/main/footer/section
 *                       （行首缩进 ≤2 空格的开始标签）都带 data-od-id（--od-ignore <子串> 可精确豁免）
 *   P6 content          去标签后的可见文本 ≥ 200 个字符，且不含 lorem ipsum / Feature one /
 *                       Sample content / TODO / 占位文案
 *
 * 明确不做：不算对比度、不跑 axe、不做视觉 diff（当日那套 4 档/6 态/对比度取值是人工复跑，
 * 本脚本只固化「可重复的最小集」；要扩就另立）。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RULES = [
  { id: 'P1', name: 'external-url' },
  { id: 'P2', name: 'external-img' },
  { id: 'P3', name: 'hex-outside-root' },
  { id: 'P4', name: 'emoji-icon' },
  { id: 'P5', name: 'od-id' },
  { id: 'P6', name: 'content' },
]

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function normalize(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function lineAt(text, index) {
  let line = 1
  const end = Math.min(index, text.length)
  for (let i = 0; i < end; i++) if (text[i] === '\n') line++
  return line
}

/** 把匹配到的块替换成等长空白（保留换行），使后续 index/行号仍指向原文。 */
function blankOut(text, regex) {
  return text.replace(regex, (block) => block.replace(/[^\n]/g, ' '))
}

// ---------------------------------------------------------------------------
// 静态层：返回 findings[]（每条含 id / rule / msg / line），空数组即全绿。
// ---------------------------------------------------------------------------
function runStatic(rawText, opts = {}) {
  const allowEmoji = !!opts.allowEmoji
  const odIgnore = Array.isArray(opts.odIgnore) ? opts.odIgnore.filter(Boolean) : []
  const text = normalize(rawText)
  const findings = []
  const add = (id, msg, index) => {
    const rule = RULES.find((r) => r.id === id)
    findings.push({ id, rule: `${id} ${rule.name}`, msg, line: lineAt(text, index) })
  }

  // ---- P1 external-url -----------------------------------------------------
  let m
  const urlRe = /https?:\/\/[^\s"'<>()]*/g
  while ((m = urlRe.exec(text)) !== null) {
    if (m[0].startsWith('http://www.w3.org/')) continue // XML/SVG 命名空间白名单
    add('P1', `外部 URL：${m[0].slice(0, 80)}`, m.index)
  }
  const importRe = /@import\b/g
  while ((m = importRe.exec(text)) !== null) add('P1', '@import 外链样式', m.index)
  const urlFnRe = /url\(\s*['"]?\s*(?:https?:)?\/\//g
  while ((m = urlFnRe.exec(text)) !== null) {
    if (/url\(\s*['"]?\s*https?:/i.test(m[0])) continue // 已由上面的 https 规则覆盖
    add('P1', 'url() 里引用协议相对外链', m.index)
  }

  // ---- P2 external-img -----------------------------------------------------
  const tagRe = /<(img|source)\b[^>]*>/gi
  while ((m = tagRe.exec(text)) !== null) {
    const tag = m[0]
    const attrRe = /\b(src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
    let a
    while ((a = attrRe.exec(tag)) !== null) {
      const attr = (a[1] || '').toLowerCase()
      const val = a[2] ?? a[3] ?? a[4] ?? ''
      const external = /https?:\/\//i.test(val) || /^\s*\/\//.test(val) || /[\s,]\/\//.test(val)
      if (external) add('P2', `<${m[1].toLowerCase()}> ${attr} 指向外链：${val.slice(0, 60)}`, m.index)
    }
  }

  // ---- P3 hex-outside-root -------------------------------------------------
  const withoutRoot = blankOut(text, /:root\b[^{]*\{[\s\S]*?\}/g)
  const hexRe = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g
  const hexes = []
  while ((m = hexRe.exec(withoutRoot)) !== null) hexes.push(m)
  if (hexes.length > 12) {
    add('P3', `:root 外裸 hex ${hexes.length} 个（阈值 ≤12）`, hexes[12].index)
  }

  // ---- P4 emoji-icon -------------------------------------------------------
  if (!allowEmoji) {
    const emojiRe = /\p{Extended_Pictographic}/gu
    while ((m = emojiRe.exec(text)) !== null) add('P4', `发现 emoji 图标：${m[0]}`, m.index)
  }

  // ---- P5 od-id ------------------------------------------------------------
  const odRe = /data-od-id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
  const odValues = []
  while ((m = odRe.exec(text)) !== null) odValues.push(m[1] ?? m[2] ?? m[3] ?? '')
  if (odValues.length === 0) {
    add('P5', '全文没有任何 data-od-id', 0)
  } else {
    const seen = new Set()
    const dup = new Set()
    for (const v of odValues) {
      if (seen.has(v)) dup.add(v)
      seen.add(v)
    }
    if (dup.size) add('P5', `data-od-id 值重复：${[...dup].join(', ')}`, text.indexOf('data-od-id'))
  }
  // 顶层区域近似判据：行首缩进 ≤2 空格的 header/main/footer/section 开始标签必须带 data-od-id
  const offsets = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') offsets.push(i + 1)
  const lineArr = text.split('\n')
  for (let li = 0; li < lineArr.length; li++) {
    const line = lineArr[li]
    const ws = line.match(/^[ \t]*/)[0]
    const indent = ws.replace(/\t/g, '  ').length
    if (indent > 2) continue
    const afterWs = line.slice(ws.length)
    const tm = afterWs.match(/^<(header|main|footer|section)\b/i)
    if (!tm) continue
    const region = tm[1].toLowerCase()
    const tagStart = offsets[li] + ws.length
    const gt = text.indexOf('>', tagStart)
    const tagText = gt >= 0 ? text.slice(tagStart, gt + 1) : afterWs
    if (/data-od-id/.test(tagText)) continue
    if (odIgnore.some((s) => tagText.includes(s) || afterWs.includes(s))) continue
    add('P5', `顶层 <${region}> 缺 data-od-id`, tagStart)
  }

  // ---- P6 content ----------------------------------------------------------
  const visible = text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
  const compact = visible.replace(/\s+/g, '')
  if (compact.length < 200) {
    add('P6', `去标签后可见文本仅 ${compact.length} 字符（阈值 ≥200）`, 0)
  }
  const forbidden = [
    [/lorem ipsum/i, 'lorem ipsum'],
    [/feature one/i, 'Feature one'],
    [/sample content/i, 'Sample content'],
    [/\bTODO\b/, 'TODO'],
    [/占位文案/, '占位文案'],
  ]
  for (const [re, label] of forbidden) {
    const mm = re.exec(text)
    if (mm) add('P6', `含占位文案「${label}」`, mm.index)
  }

  findings.sort((a, b) => (a.id === b.id ? a.line - b.line : a.id < b.id ? -1 : 1))
  return findings
}

// ---------------------------------------------------------------------------
// --self-test：合法 fixture 应全绿；对 P1–P6 各注入一次违规，每次都必须在目标规则上变红
// （且只为该规则变红，证明规则互不串味）。这是静态层「红/绿都被证明过」的确定性证据。
// ---------------------------------------------------------------------------
function baseFixture() {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>原型自测 fixture</title>
<style>
:root { --bg:#ffffff; --fg:#222222; --accent:#0066cc; --muted:#6b7280; }
body { margin:0; background:var(--bg); color:var(--fg); font-family:system-ui,sans-serif; }
</style>
</head>
<body>
<header data-od-id="hdr">
  <h1>看板原型自测页</h1>
  <p>这是一个用于脚本确定性自测的最小原型页面，包含足够数量的可见正文，用来验证静态检查脚本在合法输入下能够全部通过。</p>
</header>
<main data-od-id="main">
  <section data-od-id="sec-a">
    <h2>任务列表</h2>
    <p>第一列承载待办事项，第二列承载进行中的工作，第三列承载已经完成的条目。</p>
    <p>本页不引用任何外部资源，不使用表情符号作为图标，颜色尽量收敛在根变量里，并且每个顶层区域都带有可溯源的标识。</p>
    <p>补充说明：这一页同时用于演示三个宽度下的布局，但脚本本身只做离线的静态断言，不依赖浏览器、不访问网络、也不读取任何第三方依赖。</p>
  </section>
</main>
<footer data-od-id="ftr">
  <p>页脚说明：本页仅用于检查脚本自身的红绿自测，不面向真实用户，也不构成任何产品交付内容。</p>
</footer>
</body>
</html>
`
}

function selfTest() {
  console.log('SELF-TEST: check_prototype 静态层（合法 fixture 应绿；P1–P6 各注入一次应红在该规则上）')
  let ok = true
  const base = baseFixture()

  const baseFindings = runStatic(base)
  if (baseFindings.length === 0) {
    console.log('  legal fixture: PASS ✓（P1–P6 全绿）')
  } else {
    ok = false
    console.log('  legal fixture: FAIL ✗ — 期望 0 条，实得：')
    for (const f of baseFindings) console.log(`    ${f.rule} ✗ ${f.msg}（line ${f.line}）`)
  }

  const injections = [
    {
      id: 'P1',
      label: 'external-url（注入 https 外链 script）',
      text: base.replace('</body>', '<script src="https://example.com/x.js"></script>\n</body>'),
    },
    {
      id: 'P2',
      label: 'external-img（注入协议相对 img）',
      text: base.replace('</body>', '<img src="//example.com/x.png" alt="x">\n</body>'),
    },
    {
      id: 'P3',
      label: 'hex-outside-root（:root 外注入 13 个 hex）',
      text: base.replace(
        '</style>',
        '.x{color:#111111;background:#222222;border-color:#333333;outline-color:#444444;fill:#555555;'
          + 'stroke:#666666;box-shadow:0 0 0 #777777;text-shadow:0 0 0 #888888;caret-color:#999999;'
          + 'accent-color:#aaaaaa;--a:#bbbbbb;--b:#cccccc;--c:#dddddd}\n</style>',
      ),
    },
    {
      id: 'P4',
      label: 'emoji-icon（注入一个 🚀）',
      text: base.replace('看板原型自测页', '看板原型自测页 🚀'),
    },
    {
      id: 'P5',
      label: 'od-id（删掉 header/footer 的 data-od-id）',
      text: base.replace(' data-od-id="hdr"', '').replace(' data-od-id="ftr"', ''),
    },
    {
      id: 'P6',
      label: 'content（正文换成 lorem ipsum）',
      text: base
        .replace(/<header[\s\S]*?<\/header>/, '<header data-od-id="hdr"><p>lorem ipsum</p></header>')
        .replace(/<main[\s\S]*?<\/main>/, '<main data-od-id="main"><section data-od-id="sec-a"><p>lorem ipsum dolor sit amet</p></section></main>')
        .replace(/<footer[\s\S]*?<\/footer>/, '<footer data-od-id="ftr"><p>lorem ipsum</p></footer>'),
    },
  ]

  for (const inj of injections) {
    const f = runStatic(inj.text)
    const ids = new Set(f.map((x) => x.id))
    if (ids.has(inj.id) && ids.size === 1) {
      const first = f.find((x) => x.id === inj.id)
      console.log(`  inject ${inj.label}: RED on ${inj.id} ✓（${first.msg}）`)
    } else if (ids.has(inj.id)) {
      ok = false
      console.log(`  inject ${inj.label}: RED on ${inj.id} 但误伤其它规则 ${[...ids].filter((i) => i !== inj.id).join(',')} ✗`)
    } else {
      ok = false
      console.log(`  inject ${inj.label}: 未在 ${inj.id} 变红（实得 ${[...ids].join(',') || 'none'}）✗`)
    }
  }

  console.log(ok ? 'SELF-TEST PASS' : 'SELF-TEST FAIL')
  return ok
}

// ---------------------------------------------------------------------------
// 运行时层（--browser，可选）：Chrome 四级回退 → CDP（Node>=22 全局 WebSocket）。
// 找不到 Chrome 时 exit 2 SKIP（不硬编码单一路径）。
// ---------------------------------------------------------------------------
function findChrome(explicit) {
  const tried = []
  const candidates = []
  if (explicit) candidates.push(explicit)
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH)
  if (process.platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    candidates.push('/Applications/Chromium.app/Contents/MacOS/Chromium')
    candidates.push('/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary')
  } else if (process.platform === 'win32') {
    const bases = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env['LOCALAPPDATA']]
    for (const b of bases.filter(Boolean)) {
      candidates.push(path.join(b, 'Google', 'Chrome', 'Application', 'chrome.exe'))
      candidates.push(path.join(b, 'Chromium', 'Application', 'chrome.exe'))
    }
  } else {
    candidates.push('google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser')
  }
  for (const c of candidates) {
    tried.push(c)
    if (c.includes('/') || c.includes('\\')) {
      try {
        if (fs.existsSync(c) && fs.statSync(c).isFile()) return { path: c, tried }
      } catch { /* ignore */ }
    } else {
      const which = spawnSync('which', [c], { encoding: 'utf-8' })
      if (which.status === 0 && which.stdout.trim()) return { path: which.stdout.trim(), tried }
    }
  }
  return { path: null, tried }
}

/**
 * 极简 CDP over WebSocket 客户端（零依赖，Node>=22 全局 WebSocket）。
 * 每条命令带超时；socket 关闭/报错时把未决命令全部 reject —— 这样渲染进程崩溃
 * （Inspector.targetCrashed）时脚本会**如实失败**而不是静默挂起/退出 0。
 */
function cdpClient(wsUrl, { timeoutMs = 8000 } = {}) {
  const ws = new WebSocket(wsUrl)
  let nextId = 1
  const pending = new Map()
  const listeners = new Map()
  const rejectAll = (err) => {
    for (const { reject } of pending.values()) reject(err)
    pending.clear()
  }
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve())
    ws.addEventListener('error', () => reject(new Error('CDP WebSocket error')))
  })
  ws.addEventListener('close', () => rejectAll(new Error('CDP socket closed before reply')))
  ws.addEventListener('message', (ev) => {
    let msg
    try { msg = JSON.parse(ev.data) } catch { return }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message || 'CDP error'))
      else resolve(msg.result)
    } else if (msg.method) {
      for (const fn of listeners.get(msg.method) || []) fn(msg.params)
    }
  })
  const send = (method, params = {}) => {
    const id = nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }
      }, timeoutMs)
      pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v) },
        reject: (e) => { clearTimeout(timer); reject(e) },
      })
      ws.send(JSON.stringify({ id, method, params }))
    })
  }
  const on = (method, fn) => {
    const arr = listeners.get(method) || []
    arr.push(fn)
    listeners.set(method, arr)
  }
  const once = (method) => new Promise((resolve) => {
    const fn = (p) => {
      listeners.set(method, (listeners.get(method) || []).filter((f) => f !== fn))
      resolve(p)
    }
    on(method, fn)
  })
  const close = () => { try { ws.close() } catch { /* ignore */ } }
  return { ready, send, on, once, close }
}

async function runBrowser(opts, htmlPath) {
  const found = findChrome(opts.chrome)
  if (!found.path) {
    console.log(`SKIP: 找不到 Chrome（尝试过：${found.tried.join(', ')}）`)
    return { skip: true, reason: 'chrome-missing' }
  }
  if (typeof WebSocket === 'undefined') {
    console.log('SKIP: 当前 Node 无全局 WebSocket（需 Node >= 22）')
    return { skip: true, reason: 'no-websocket' }
  }

  const widths = String(opts.widths || '1440,768,390')
    .split(',').map((w) => parseInt(w.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0)
  const states = String(opts.states || 'normal,loading,error,readonly,empty')
    .split(',').map((s) => s.trim()).filter(Boolean)
  const demoAttr = opts.demoAttr || 'data-demo'
  const protoName = path.basename(path.dirname(htmlPath)) || 'prototype'
  const outDir = opts.out ? path.resolve(opts.out) : path.join(os.tmpdir(), 'prototype-shots', protoName)
  fs.mkdirSync(outDir, { recursive: true })
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proto-cdp-'))
  const fileUrl = pathToFileURL(htmlPath).href

  const args = [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-gpu',
    'about:blank',
  ]
  const child = spawn(found.path, args, { stdio: 'ignore' })
  const findings = []
  const consoleErrors = []
  let client = null
  let crashed = false
  try {
    // 1) 等 DevToolsActivePort 出现并读端口
    const portFile = path.join(userDataDir, 'DevToolsActivePort')
    const deadline = Date.now() + 15000
    let port = null
    while (Date.now() < deadline) {
      if (fs.existsSync(portFile)) {
        const first = fs.readFileSync(portFile, 'utf-8').split('\n')[0].trim()
        if (first) { port = parseInt(first, 10); break }
      }
      await delay(150)
    }
    if (!port) throw new Error('Chrome 未在 15s 内暴露 DevToolsActivePort')

    // 2) 取 page target
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    const target = list.find((t) => t.type === 'page')
    if (!target || !target.webSocketDebuggerUrl) throw new Error('/json/list 无可用 page target')

    // 3) 连 CDP 并启用域
    client = cdpClient(target.webSocketDebuggerUrl)
    await client.ready
    await client.send('Page.enable')
    await client.send('Runtime.enable')
    await client.send('Log.enable')
    client.on('Runtime.exceptionThrown', (p) => {
      const d = p && p.exceptionDetails
      consoleErrors.push((d && (d.exception && d.exception.description)) || (d && d.text) || 'exception')
    })
    client.on('Log.entryAdded', (p) => {
      const e = p && p.entry
      if (e && e.level === 'error') consoleErrors.push(`${e.source || ''} ${e.text || ''}`.trim())
    })
    client.on('Inspector.targetCrashed', () => { crashed = true })

    // 4) 逐宽度：切设备指标 → 导航 → 等 load → 断言 → 截图（含五态）
    for (const width of widths) {
      await client.send('Emulation.setDeviceMetricsOverride', {
        width, height: 900, deviceScaleFactor: 1, mobile: width < 640,
      })
      const loaded = client.once('Page.loadEventFired')
      await client.send('Page.navigate', { url: fileUrl })
      await Promise.race([loaded, delay(8000)])

      // R2 no-h-overflow
      const ov = await client.send('Runtime.evaluate', {
        expression: 'document.documentElement.scrollWidth <= window.innerWidth + 1',
        returnByValue: true,
      })
      if (!(ov && ov.result && ov.result.value === true)) {
        findings.push({ id: 'R2', msg: `宽度 ${width} 出现横向溢出（scrollWidth > innerWidth + 1）` })
      }

      // R3 states 开关存在性
      const stExpr = `Array.from(document.querySelectorAll('[${demoAttr}]')).map(e => e.getAttribute('${demoAttr}'))`
      const st = await client.send('Runtime.evaluate', { expression: stExpr, returnByValue: true })
      const present = (st && st.result && st.result.value) || []
      const missing = states.filter((s) => !present.includes(s))
      if (missing.length) findings.push({ id: 'R3', msg: `宽度 ${width} 缺状态开关：${missing.join(', ')}` })

      // 默认态截图 + 逐态点击截图
      const shot = await client.send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(path.join(outDir, `${width}.png`), Buffer.from(shot.data, 'base64'))
      for (const s of states) {
        if (!present.includes(s)) continue
        await client.send('Runtime.evaluate', {
          expression: `(() => { const el = document.querySelector('[${demoAttr}="${s}"]'); if (el) el.click(); })()`,
        })
        await delay(150)
        const ssh = await client.send('Page.captureScreenshot', { format: 'png' })
        fs.writeFileSync(path.join(outDir, `${width}-${s}.png`), Buffer.from(ssh.data, 'base64'))
      }
    }

    // R1 console-error
    if (consoleErrors.length) {
      findings.push({ id: 'R1', msg: `console/exception error × ${consoleErrors.length}：${consoleErrors.slice(0, 3).join(' | ')}` })
    }
  } catch (e) {
    const why = crashed ? '（检测到 Inspector.targetCrashed：渲染进程崩溃，多为无头环境限制）' : ''
    findings.push({ id: 'RB', msg: 'browser 运行失败' + why + '：' + e.message })
  } finally {
    if (client) client.close()
    try { child.kill('SIGKILL') } catch { /* ignore */ }
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    } catch { /* Chrome 退出时目录可能仍被占用，忽略 */ }
  }
  return { skip: false, findings, outDir }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = {
    dir: null, html: 'index.html', out: null, browser: false,
    widths: '1440,768,390', chrome: null, allowEmoji: false, odIgnore: [],
    states: null, demoAttr: 'data-demo', selfTest: false, help: false, bad: null,
  }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--self-test') opts.selfTest = true
    else if (a === '--browser') opts.browser = true
    else if (a === '--allow-emoji') opts.allowEmoji = true
    else if (a === '--html') opts.html = argv[++i]
    else if (a === '--out') opts.out = argv[++i]
    else if (a === '--widths') opts.widths = argv[++i]
    else if (a === '--chrome') opts.chrome = argv[++i]
    else if (a === '--demo-attr') opts.demoAttr = argv[++i]
    else if (a === '--states') opts.states = argv[++i]
    else if (a === '--od-ignore') opts.odIgnore.push(argv[++i])
    else if (a === '--help' || a === '-h') opts.help = true
    else if (a.startsWith('--')) opts.bad = a
    else positional.push(a)
  }
  if (positional.length) opts.dir = positional[0]
  return opts
}

function printUsage() {
  console.log('用法：')
  console.log('  node scripts/check_prototype.mjs <prototype-dir> [--html index.html] [--out <dir>]')
  console.log('  node scripts/check_prototype.mjs <prototype-dir> --browser [--widths 1440,768,390] [--chrome <path>]')
  console.log('  node scripts/check_prototype.mjs --self-test')
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) { printUsage(); process.exit(0) }
  if (opts.bad || (!opts.selfTest && !opts.dir)) {
    if (opts.bad) console.error(`未知参数：${opts.bad}`)
    printUsage()
    process.exit(1)
  }
  if (opts.selfTest) { process.exit(selfTest() ? 0 : 1) }

  const dir = path.resolve(opts.dir)
  const htmlPath = path.resolve(dir, opts.html || 'index.html')
  if (!fs.existsSync(htmlPath)) {
    console.log('PROTOTYPE CHECK: FAIL')
    console.log(`  - 找不到 html：${htmlPath}`)
    process.exit(1)
  }
  const text = fs.readFileSync(htmlPath, 'utf-8')
  const rel = path.relative(process.cwd(), htmlPath) || htmlPath
  const staticFindings = runStatic(text, { allowEmoji: opts.allowEmoji, odIgnore: opts.odIgnore })

  console.log(`PROTOTYPE CHECK (static)：${rel}`)
  for (const r of RULES) {
    const group = staticFindings.filter((f) => f.id === r.id)
    if (group.length === 0) console.log(`  ${r.id} ${r.name} ✓`)
    else for (const f of group) console.log(`  ${f.rule} ✗ ${f.msg}（${rel}:${f.line}）`)
  }

  let findings = staticFindings.slice()
  let browserSkip = false
  if (opts.browser) {
    console.log('PROTOTYPE CHECK (browser/CDP)：')
    const res = await runBrowser(opts, htmlPath)
    if (res.skip) {
      browserSkip = true
    } else {
      if (res.findings.length === 0) console.log('  R1 console-error ✓  R2 no-h-overflow ✓  R3 states ✓')
      else for (const f of res.findings) console.log(`  ${f.id} ✗ ${f.msg}`)
      console.log(`  screenshots → ${res.outDir}`)
      findings = findings.concat(res.findings)
    }
  }

  if (findings.length) {
    console.log('PROTOTYPE CHECK: FAIL')
    process.exit(1)
  }
  if (browserSkip) {
    console.log('PROTOTYPE CHECK: SKIPPED（Chrome 缺失）— 静态层已通过；人工验收须原样转述 SKIP')
    process.exit(2)
  }
  console.log('PROTOTYPE CHECK: OK')
  process.exit(0)
}

main().catch((e) => {
  console.error('check_prototype fatal:', (e && e.stack) || e)
  process.exit(1)
})
