export type CopyResult = { ok: true } | { ok: false; reason: string }

export async function copyToClipboard(text: string): Promise<CopyResult> {
  if (!navigator.clipboard?.writeText) {
    return { ok: false, reason: 'Clipboard access is not available in this browser context.' }
  }
  try {
    await navigator.clipboard.writeText(text)
    return { ok: true }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Clipboard permission was denied.'
    return { ok: false, reason }
  }
}
