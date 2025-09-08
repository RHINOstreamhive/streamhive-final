---
to: src/models/<%= h.changeCase.camel(name) %>.ts
---
export type <%= h.changeCase.pascal(name) %> = {
  id: string
  createdAt: string
  updatedAt: string
}

export function create<%= h.changeCase.pascal(name) %>(): <%= h.changeCase.pascal(name) %> {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now }
}
