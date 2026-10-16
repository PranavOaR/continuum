import { describe, expect, it } from 'vitest'
import { canonicalJson, hashContent, hashRecord } from '../hash'

describe('hashing', () => {
  it('produces a stable sha256 hex digest', () => {
    expect(hashContent('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
    expect(hashContent(new TextEncoder().encode('hello'))).toBe(hashContent('hello'))
  })

  it('serialises objects canonically regardless of key order', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[3,{"x":2,"y":1}]},"b":1}')
    expect(hashRecord('task', { a: 1, b: 2 })).toBe(hashRecord('task', { b: 2, a: 1 }))
  })

  it('separates identical values of different kinds', () => {
    expect(hashRecord('task', { id: 'x' })).not.toBe(hashRecord('memory', { id: 'x' }))
  })

  it('drops undefined properties, as JSON does', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}')
  })
})
