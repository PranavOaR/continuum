import { useRef, useState } from 'react'
import { DEMO_VIDEO } from './siteContent'

/** Before the first play the cover (with its own play button) shows; native controls take over once it plays. */
type PlaybackState = 'cover' | 'started' | 'failed'

/**
 * The demo video. Until it is played there are no native controls: phones
 * draw their own play button over the cover's, off-centre, which reads as
 * broken. If the browser cannot play the file inline, a link opens it in the
 * phone's own player instead of leaving an empty box.
 */
export function DemoVideo() {
  const video = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<PlaybackState>('cover')

  const play = async () => {
    const element = video.current
    if (!element) return
    setState('started')
    element.focus()
    try {
      await element.play()
    } catch (error) {
      // Interrupted by a pause the viewer chose is fine; anything else means it cannot play here.
      if (!(error instanceof DOMException && error.name === 'AbortError')) setState('failed')
    }
  }

  return (
    <figure>
      <div className="relative overflow-hidden rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_40px_-12px_rgb(0_0_0/0.18)]">
        <video
          ref={video}
          className="block aspect-video w-full bg-surface focus:outline-none"
          src={DEMO_VIDEO.src}
          poster={DEMO_VIDEO.poster}
          aria-describedby="demo-video-caption"
          controls={state === 'started'}
          playsInline
          preload="metadata"
          tabIndex={state === 'started' ? 0 : -1}
          onError={() => setState('failed')}
        >
          <track kind="captions" src={DEMO_VIDEO.captions} srcLang="en" label="English" default />
          <a href={DEMO_VIDEO.src}>Download the demo video</a>
        </video>
        {state === 'cover' && (
          // Covers the whole poster, whose centre already shows a play button.
          <button
            type="button"
            onClick={play}
            aria-label={`Play the demo video (${DEMO_VIDEO.length}, with sound)`}
            className="absolute inset-0 cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent"
          />
        )}
        {state === 'failed' && (
          <div role="status" className="absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-line bg-surface/95 px-4 py-3 text-[13.5px] shadow-sm backdrop-blur">
            <span className="text-muted">This browser can’t play the video here.</span>
            <a href={DEMO_VIDEO.src} target="_blank" rel="noopener" className="font-medium text-accent underline-offset-4 hover:underline">
              Open the video
            </a>
          </div>
        )}
      </div>
      <figcaption id="demo-video-caption" className="mt-3 max-w-[720px] text-[13.5px] leading-[1.55] text-muted">{DEMO_VIDEO.caption}</figcaption>
    </figure>
  )
}
