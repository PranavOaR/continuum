import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { HtmlTagDescriptor, Plugin } from 'vite'

/** The public website's address; share previews need absolute URLs. */
export const SITE_URL = 'https://continuumgroup.dev'

const TITLE = 'Continuum — Your work continues. Your agents change.'
const DESCRIPTION = 'Local project memory for AI coding agents. Every Claude Code, Codex or Cursor session starts knowing where the last one left off. Nothing leaves your machine.'

/**
 * The share image's address, with a fingerprint of its content: WhatsApp, Slack and others cache
 * previews by image address, so a changed image gets a new address and is fetched again.
 */
function shareImage(): string {
  const digest = createHash('sha256').update(readFileSync(new URL('./site-public/og.png', import.meta.url))).digest('hex').slice(0, 10)
  return `${SITE_URL}/og.png?v=${digest}`
}

const meta = (attribute: 'name' | 'property', key: string, content: string): HtmlTagDescriptor => ({ tag: 'meta', attrs: { [attribute]: key, content }, injectTo: 'head' })

/**
 * Tags only the website needs: what link previews (WhatsApp, Slack, X,
 * LinkedIn) and search engines read. The dashboard is local and gets none.
 */
export function siteHead(): Plugin {
  return {
    name: 'continuum-site-head',
    transformIndexHtml: () => {
      const image = shareImage()
      return [
      { tag: 'link', attrs: { rel: 'canonical', href: `${SITE_URL}/` }, injectTo: 'head' },
      { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }, injectTo: 'head' },
      meta('name', 'theme-color', '#fafaf7'),
      meta('property', 'og:type', 'website'),
      meta('property', 'og:site_name', 'Continuum'),
      meta('property', 'og:url', `${SITE_URL}/`),
      meta('property', 'og:title', TITLE),
      meta('property', 'og:description', DESCRIPTION),
      meta('property', 'og:image', image),
      meta('property', 'og:image:secure_url', image),
      meta('property', 'og:image:type', 'image/png'),
      meta('property', 'og:image:width', '1200'),
      meta('property', 'og:image:height', '630'),
      meta('property', 'og:image:alt', 'Continuum: your work continues, your agents change. Works with Claude Code, Codex and Cursor.'),
      meta('name', 'twitter:card', 'summary_large_image'),
      meta('name', 'twitter:title', TITLE),
      meta('name', 'twitter:description', DESCRIPTION),
      meta('name', 'twitter:image', image),
      ]
    },
  }
}
