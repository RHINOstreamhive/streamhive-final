export type User = { id: string; email: string; createdAt: string };
export type Creator = { id: string; userId: string; handle: string; createdAt: string };
export type Wallet = { id: string; userId: string; diamonds: number; updatedAt: string };
export type Receipt = { id: string; userId: string; amount: number; createdAt: string };
