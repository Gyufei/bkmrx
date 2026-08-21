import { describe, expect, it } from 'vitest'
import { isForeignTranslationCandidate } from './translation'

describe('foreign description detection', () => {
  it('accepts descriptions written entirely in foreign scripts', () => {
    expect(isForeignTranslationCandidate('Build faster with AI — version 2.0')).toBe(true)
    expect(isForeignTranslationCandidate('Привет, мир')).toBe(true)
    expect(isForeignTranslationCandidate('日本語の説明')).toBe(true)
    expect(isForeignTranslationCandidate('안녕하세요')).toBe(true)
  })

  it('rejects empty, numeric-only, Chinese, and mixed descriptions', () => {
    expect(isForeignTranslationCandidate('')).toBe(false)
    expect(isForeignTranslationCandidate('1234 — 2.0')).toBe(false)
    expect(isForeignTranslationCandidate('中文描述')).toBe(false)
    expect(isForeignTranslationCandidate('English 与中文')).toBe(false)
  })
})
