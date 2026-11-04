/** Rough characters per token for English and code: an estimate, never an exact count. */
export const CHARS_PER_TOKEN = 4

export const estimateTokens = (text: string) => Math.ceil(text.length / CHARS_PER_TOKEN)
