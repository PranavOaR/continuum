// The demo video's dashboard scene: five beats, one per narration line. Each
// beat glides the scroll, cursor and zoom onto what its line is about, then
// holds while the line is spoken.

/** How long a beat takes to glide into place, and the shortest a beat may be. */
const MOVE_S = 1.2
const BEAT_MIN_S = 3
/** The first beat starts once the browser frame has settled in. */
const FIRST_BEAT_S = 0.4

const CAPTIONS = {
  task: 'One task, carried from Claude Code to Codex',
  verified: 'Verified: npm test ran against the exact file contents',
  criteria: 'Acceptance criteria and steps, as the agents reported them',
  change: 'The change itself, covered by the passing check',
  events: 'Every event in order: Claude Code, then Codex',
}

/** Where the dashboard's key elements sit on the page (page coordinates), found by their text. */
export async function anchors(page, taskTitle) {
  return page.evaluate((title) => {
    const ownText = (el) => [...el.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent).join('').trim()
    const visible = (el) => el.getBoundingClientRect().height > 0
    const find = (text, { minFont = 0, within = document.body } = {}) => {
      const hit = [...within.querySelectorAll('*')].find((el) => (ownText(el) === text || (el.children.length === 0 && el.textContent.trim() === text)) && parseFloat(getComputedStyle(el).fontSize) >= minFont && visible(el))
      if (!hit) throw new Error(`dashboard element not found: ${text}`)
      return hit
    }
    const point = (el) => {
      const box = el.getBoundingClientRect()
      return { x: box.left + Math.min(box.width, 220) / 2, y: box.top + window.scrollY + box.height / 2 }
    }
    const section = (heading) => find(heading).closest('section, article, [class*="rounded"]') ?? document.body
    const activity = section('Agent activity')
    // The last activity entry that names Codex: where the handoff ends, whatever the run called it.
    const codex = [...activity.querySelectorAll('li, [class*="flex"]')].filter((el) => visible(el) && /Codex/.test(el.textContent) && el.children.length > 0).at(-1)
    return {
      task: point(find(title, { minFont: 18 })),
      verified: point(find('Verified', { within: section('Verification') })),
      criteria: point(find('Acceptance criteria')),
      file: point(find('src/pricing.js', { within: section('File changes') })),
      activity: point(find('Agent activity')),
      codex: point(codex ?? find('Agent activity')),
      maxScroll: document.documentElement.scrollHeight - window.innerHeight,
    }
  }, taskTitle)
}

/** When each beat starts and ends (seconds into the scene): as long as its line, never shorter than BEAT_MIN_S. */
export function dashboardBeats(lines) {
  let start = FIRST_BEAT_S
  return lines.map(({ id, seconds }) => {
    const beat = { id, start, end: start + Math.max(BEAT_MIN_S, seconds + 0.5), caption: CAPTIONS[id] }
    start = beat.end
    return beat
  })
}

/** Where each beat lands: scroll, cursor and zoom focus in page coordinates. */
function targets(box) {
  const top = (y, offset) => Math.round(Math.max(0, Math.min(box.maxScroll, y - offset)))
  return {
    task: { scroll: 0, cursor: box.task, focus: box.task, zoom: 1.18 },
    verified: { scroll: 0, cursor: box.verified, focus: box.verified, zoom: 1.4 },
    criteria: { scroll: top(box.criteria.y, 130), cursor: { x: box.criteria.x + 120, y: box.criteria.y + 60 }, focus: { x: box.criteria.x + 160, y: box.criteria.y + 90 }, zoom: 1.2 },
    change: { scroll: top(box.file.y, 260), cursor: box.file, focus: box.file, zoom: 1.28 },
    events: { scroll: top(box.activity.y, 90), scrollEnd: top(box.codex.y, 380), cursor: box.codex, focus: box.codex, zoom: 1.08 },
  }
}

const clamp = (x) => Math.min(1, Math.max(0, x))
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
const mix = (a, b, x) => a + (b - a) * x
const mixPoint = (a, b, x) => ({ x: mix(a.x, b.x, x), y: mix(a.y, b.y, x) })

/**
 * The dashboard at t seconds into its scene: scroll (whole pixels, so a still
 * page reuses its screenshot), zoom and its focus, cursor, and caption, with
 * focus and cursor in viewport coordinates for the compositor.
 */
export function beatState(beats, box, t) {
  const at = targets(box)
  const index = Math.max(0, beats.findLastIndex((beat) => t >= beat.start))
  const beat = beats[index]
  const before = index === 0 || t < beat.start ? { scroll: 0, cursor: { x: 980, y: 420 }, focus: { x: 640, y: 360 }, zoom: 1 } : endOf(at[beats[index - 1].id])
  const target = at[beat.id]
  const move = ease(clamp((t - beat.start) / MOVE_S))
  // The events beat keeps scrolling down the activity list while its line is spoken.
  const drift = target.scrollEnd === undefined ? 0 : ease(clamp((t - beat.start - MOVE_S) / Math.max(0.1, beat.end - beat.start - MOVE_S - 0.6)))
  const scroll = Math.round(mix(before.scroll, target.scrollEnd === undefined ? target.scroll : mix(target.scroll, target.scrollEnd, drift), move))
  const cursor = mixPoint(before.cursor, target.cursor, move)
  const focus = mixPoint(before.focus, target.focus, move)
  return {
    beat: beat.id,
    settled: t - beat.start > MOVE_S + 0.3,
    scroll,
    zoom: mix(before.zoom, target.zoom, move),
    focusX: focus.x,
    focusY: focus.y - scroll,
    cursorX: cursor.x,
    cursorY: cursor.y - scroll,
    caption: beat.caption,
    captionOpacity: clamp((t - beat.start) / 0.35),
  }
}

const endOf = (target) => ({ ...target, scroll: target.scrollEnd ?? target.scroll })
