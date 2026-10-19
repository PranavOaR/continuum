import { DEMO_VIDEO } from './siteContent'

export function DemoVideo() {
  return (
    <figure>
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_40px_-12px_rgb(0_0_0/0.18)]">
        <video
          className="block aspect-video w-full"
          src={DEMO_VIDEO.src}
          poster={DEMO_VIDEO.poster}
          aria-describedby="demo-video-caption"
          controls
          playsInline
          preload="metadata"
        >
          <track kind="captions" src={DEMO_VIDEO.captions} srcLang="en" label="English" default />
          <a href={DEMO_VIDEO.src}>Download the demo video</a>
        </video>
      </div>
      <figcaption id="demo-video-caption" className="mt-3 max-w-[720px] text-[13.5px] leading-[1.55] text-muted">{DEMO_VIDEO.caption}</figcaption>
    </figure>
  )
}
