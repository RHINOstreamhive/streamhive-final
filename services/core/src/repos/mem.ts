const mem = new Map<string, any>();
export const repo = {
  upsert: <T>(k: string, v: T) => { mem.set(k, v); return v; },
  get: <T>(k: string) => mem.get(k) as T | undefined,
  all: <T>() => Array.from(mem.values()) as T[]
};
