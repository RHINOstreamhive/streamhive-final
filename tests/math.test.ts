import { describe, it, expect } from 'vitest'
import { add } from '../src/math'

describe('math', () => {
  it('adds', () => {
    expect(add(2,3)).toBe(5)
  })
})
