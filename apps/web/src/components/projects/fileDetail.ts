import type { ProjectFile } from '@continuum/core'

/** Whether there are line counts to show: demo data, or a live uncommitted change. */
export function hasLineDetail(file: ProjectFile): boolean {
  return file.diffSource !== 'none' && (file.additions > 0 || file.deletions > 0 || file.diff.length > 0)
}
