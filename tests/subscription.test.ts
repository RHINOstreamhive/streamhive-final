import { describe, it, expect } from 'vitest'
import { createSubscription } from '../src/models/subscription'

describe('Subscription', () => {
  it('creates entity', () => {
    const e = createSubscription()
    expect(e.id).toBeTruthy()
  })
})
