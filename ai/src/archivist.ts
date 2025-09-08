export const MemoryArchivist = {
  toLog(event: any) {
    return JSON.stringify({ ...event, ts: new Date().toISOString() });
  }
};
