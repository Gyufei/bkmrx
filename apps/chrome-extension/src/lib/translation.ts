export function isForeignTranslationCandidate(text: string): boolean {
  const value = text.trim()
  if (!/\p{Letter}/u.test(value)) return false
  if (!/\p{Script=Han}/u.test(value)) return true
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(value)
}
