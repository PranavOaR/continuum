/** Stamped into the release bundle by scripts/bundle.mjs; absent when running from a checkout through tsx. */
declare const __CONTINUUM_BUILD__: BuildInfo | undefined

export interface BuildInfo {
  version: string
  /** The npm package the bundle is published as, e.g. `@scope/continuum`. */
  packageName: string
}

export const BUILD_INFO: BuildInfo | null = typeof __CONTINUUM_BUILD__ === 'undefined' ? null : __CONTINUUM_BUILD__

/** Version of a checkout that has not been bundled. */
const DEVELOPMENT_VERSION = '0.0.0-dev'

export const VERSION = BUILD_INFO?.version ?? DEVELOPMENT_VERSION
