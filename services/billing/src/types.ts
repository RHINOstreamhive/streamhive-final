export type Tier = { id: string; creatorId: string; name: string; priceCents: number };
export type Subscription = { id: string; userId: string; tierId: string; active: boolean; startedAt: string };
export type Promo = { id: string; code: string; percentOff: number; active: boolean };
export type Role = { userId: string; role: 'ADMIN'|'CREATOR'|'USER' };
