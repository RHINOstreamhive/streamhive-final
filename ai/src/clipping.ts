export const ClippingAssistant = {
  enqueue(streamId: string, offsetMs: number, durationMs: number) {
    return { streamId, offsetMs, durationMs, status: 'QUEUED' };
  }
};
