#!/usr/bin/env node
// Renders the website's share image (og.png, 1200×630) and Apple touch icon
// from HTML, with the site's own fonts, colours and logos, into apps/web/site-public.
//   node scripts/site/images.mjs
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const ROOT = join(import.meta.dirname, '../..')
const OUT = join(ROOT, 'apps/web/site-public')
const LOGOS = join(ROOT, 'apps/web/src/assets/agent-logos')
const font = (pkg, file) => pathToFileURL(join(ROOT, 'node_modules/@fontsource-variable', pkg, 'files', file)).href
const svg = (name) => readFileSync(join(LOGOS, `${name}.svg`), 'utf8').replace('<svg ', '<svg style="height:100%;width:auto" ')

const MARK = '<svg viewBox="0 0 32 32" fill="none" style="height:100%;width:auto"><path d="M6 22C6 13 16 11 16 16s10 3 10-6" stroke="#141318" stroke-width="2.4" stroke-linecap="round"/><circle cx="6" cy="22" r="3" fill="#fafaf7" stroke="#141318" stroke-width="2"/><circle cx="16" cy="16" r="1.9" fill="#141318"/><circle cx="26" cy="10" r="3.4" fill="#5b45ff"/></svg>'

const STYLE = `
  @font-face { font-family: Geist; src: url('${font('geist', 'geist-latin-wght-normal.woff2')}'); font-weight: 100 900; }
  @font-face { font-family: 'Geist Mono'; src: url('${font('geist-mono', 'geist-mono-latin-wght-normal.woff2')}'); font-weight: 100 900; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: Geist, sans-serif; color: #141318; background: #fafaf7; }`

const OG = `<!doctype html><html><head><style>${STYLE}
  .card { position: relative; width: 1200px; height: 630px; overflow: hidden; padding: 64px 76px; display: flex; flex-direction: column;
    background: radial-gradient(48rem 26rem at 100% 0%, rgb(91 69 255 / 0.14), transparent 70%), #fafaf7; }
  .dots { position: absolute; inset: 0; background-image: radial-gradient(rgb(20 19 24 / 0.13) 1px, transparent 1px); background-size: 22px 22px;
    mask-image: linear-gradient(to bottom, black, transparent 85%); }
  .brand { position: relative; display: flex; align-items: center; gap: 12px; height: 40px; font-size: 30px; font-weight: 500; letter-spacing: -0.035em; }
  h1 { position: relative; margin-top: 54px; font-size: 76px; line-height: 1.04; font-weight: 400; letter-spacing: -0.045em; }
  h1 span { color: #5c5a62; }
  .thread { position: relative; display: inline-block; }
  .thread svg { position: absolute; left: 0; bottom: -10px; width: 100%; height: 18px; overflow: visible; }
  p { position: relative; margin-top: 26px; font-size: 25px; color: #5c5a62; letter-spacing: -0.01em; }
  .foot { position: relative; margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 40px; }
  code { font-family: 'Geist Mono', monospace; font-size: 21px; background: #fff; border: 1px solid #e4e2dc; border-radius: 10px; padding: 12px 18px; }
  code b { color: #8d8a98; font-weight: 400; margin-right: 10px; }
  .logos { display: flex; align-items: center; gap: 26px; }
  .logo { display: flex; align-items: center; gap: 8px; }
  .logo .i { height: 30px; display: flex; } .logo .w { height: 22px; display: flex; }
</style></head><body><div class="card"><div class="dots"></div>
  <div class="brand">${MARK}continuum</div>
  <h1>Your work <span class="thread" style="color:#141318">continues.<svg viewBox="0 0 300 24" preserveAspectRatio="none" fill="none"><path d="M2 16 C 60 4, 110 22, 160 12 S 250 4, 298 14" stroke="#5b45ff" stroke-width="3.5" stroke-linecap="round"/><circle cx="298" cy="14" r="5" fill="#5b45ff"/></svg></span><br><span>Your agents change.</span></h1>
  <p>Local project memory for AI coding agents. Nothing leaves your machine.</p>
  <div class="foot">
    <code><b>$</b>npx getcontinuum setup claude-code</code>
    <div class="logos">
      <div class="logo"><span class="i">${svg('claude-color')}</span><span class="w">${svg('claude-text')}</span></div>
      <div class="logo"><span class="i">${svg('codex-color')}</span><span class="w">${svg('codex-text')}</span></div>
      <div class="logo"><span class="i">${svg('cursor')}</span><span class="w">${svg('cursor-text')}</span></div>
    </div>
  </div>
</div></body></html>`

const ICON = `<!doctype html><html><head><style>${STYLE} .icon { width: 180px; height: 180px; display: flex; align-items: center; justify-content: center; background: #fafaf7; } .icon span { height: 124px; display: flex; }</style></head>
<body><div class="icon"><span>${MARK}</span></div></body></html>`

const browser = await chromium.launch()
try {
  for (const [html, size, file] of [[OG, { width: 1200, height: 630 }, 'og.png'], [ICON, { width: 180, height: 180 }, 'apple-touch-icon.png']]) {
    const page = await browser.newPage({ viewport: size })
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: join(OUT, file) })
    console.log(`Wrote ${file}`)
  }
} finally {
  await browser.close()
}
