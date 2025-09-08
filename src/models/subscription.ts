export type Subscription = {
  id: string
  createdAt: string
  updatedAt: string
}

export function createSubscription(): Subscription {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now }
}
