---
to: tests/<%= h.changeCase.camel(name) %>.test.ts
---
import { describe, it, expect } from 'vitest'
import { create<%= h.changeCase.pascal(name) %> } from '../src/models/<%= h.changeCase.camel(name) %>'

describe('<%= h.changeCase.pascal(name) %>', () => {
  it('creates entity', () => {
    const e = create<%= h.changeCase.pascal(name) %>()
    expect(e.id).toBeTruthy()
  })
})
