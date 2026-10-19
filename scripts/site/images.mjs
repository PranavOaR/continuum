#!/usr/bin/env node
// Renders the website's share image (og.png, 1200×630), Apple touch icon and
// the demo video's cover (demo/continuum-demo.jpg, 1920×1080) from HTML, with
// the site's own fonts, colours and logos, into apps/web/site-public.
//   node scripts/site/images.mjs
import { execFileSync } from 'node:child_process'
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

/** The demo video's length as m:ss, read from the video itself. */
function videoLength() {
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(OUT, 'demo/continuum-demo.mp4')], { encoding: 'utf8' }))
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
}

/** The video's cover: a title, a play button and the handoff it shows, not a frame from the middle of it. */
const POSTER = `<!doctype html><html><head><style>${STYLE}
  .card { position: relative; width: 1280px; height: 720px; overflow: hidden; padding: 56px 64px; display: flex; flex-direction: column; align-items: center;
    background: radial-gradient(56rem 32rem at 100% 0%, rgb(91 69 255 / 0.15), transparent 70%), radial-gradient(40rem 26rem at 0% 100%, rgb(91 69 255 / 0.07), transparent 70%), #fafaf7; }
  .dots { position: absolute; inset: 0; background-image: radial-gradient(rgb(20 19 24 / 0.12) 1px, transparent 1px); background-size: 22px 22px; mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%); }
  .brand { position: absolute; left: 64px; top: 52px; display: flex; align-items: center; gap: 12px; height: 34px; font-size: 26px; font-weight: 500; letter-spacing: -0.035em; }
  .length { position: absolute; right: 64px; top: 56px; font-family: 'Geist Mono', monospace; font-size: 17px; color: #5c5a62; background: #fff; border: 1px solid #e4e2dc; border-radius: 999px; padding: 6px 14px; }
  .eyebrow { position: relative; margin-top: 118px; font-family: 'Geist Mono', monospace; font-size: 15px; letter-spacing: 0.14em; text-transform: uppercase; color: #5b45ff; }
  h1 { position: relative; margin-top: 16px; font-size: 64px; line-height: 1.05; font-weight: 400; letter-spacing: -0.045em; text-align: center; }
  h1 span { color: #5c5a62; }
  .play { position: relative; margin-top: 44px; width: 112px; height: 112px; border-radius: 50%; background: #5b45ff; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 0 12px rgb(91 69 255 / 0.12), 0 0 0 26px rgb(91 69 255 / 0.06), 0 24px 50px -12px rgb(91 69 255 / 0.55); }
  .play svg { width: 40px; height: 40px; margin-left: 6px; }
  .handoff { position: absolute; bottom: 52px; left: 0; right: 0; display: flex; justify-content: center; align-items: center; gap: 18px; font-size: 17px; color: #5c5a62; }
  .agent { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #e4e2dc; border-radius: 12px; padding: 10px 16px; }
  .agent .i { height: 24px; display: flex; } .agent .w { height: 18px; display: flex; }
  .arrow { width: 70px; height: 14px; }
</style></head><body><div class="card"><div class="dots"></div>
  <div class="brand">${MARK}continuum</div>
  <div class="length">${videoLength()}</div>
  <p class="eyebrow">Demo · recorded from real sessions</p>
  <h1>See a real handoff.<br><span>Claude Code starts. Codex finishes.</span></h1>
  <div class="play"><svg viewBox="0 0 24 24"><path d="M6 4.5v15a1 1 0 0 0 1.52.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 6 4.5z" fill="#fff"/></svg></div>
  <div class="handoff">
    <div class="agent"><span class="i">${svg('claude-color')}</span><span class="w">${svg('claude-text')}</span></div>
    <svg class="arrow" viewBox="0 0 70 14" fill="none"><path d="M2 7 C 20 1, 40 13, 60 7" stroke="#5b45ff" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 5"/><path d="M58 2 L66 7 L58 12" stroke="#5b45ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <div class="agent"><span class="i">${svg('codex-color')}</span><span class="w">${svg('codex-text')}</span></div>
  </div>
</div></body></html>`

const ICON = `<!doctype html><html><head><style>${STYLE} .icon { width: 180px; height: 180px; display: flex; align-items: center; justify-content: center; background: #fafaf7; } .icon span { height: 124px; display: flex; }</style></head>
<body><div class="icon"><span>${MARK}</span></div></body></html>`

const browser = await chromium.launch()
try {
  const IMAGES = [
    { html: OG, size: { width: 1200, height: 630 }, file: 'og.png' },
    { html: ICON, size: { width: 180, height: 180 }, file: 'apple-touch-icon.png' },
    // 1280×720 laid out, 1920×1080 captured, like the video itself.
    { html: POSTER, size: { width: 1280, height: 720 }, scale: 1.5, file: 'demo/continuum-demo.jpg', jpeg: true },
  ]
  for (const { html, size, scale = 1, file, jpeg } of IMAGES) {
    const page = await browser.newPage({ viewport: size, deviceScaleFactor: scale })
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: join(OUT, file), ...(jpeg ? { type: 'jpeg', quality: 90 } : {}) })
    console.log(`Wrote ${file}`)
  }
} finally {
  await browser.close()
}
