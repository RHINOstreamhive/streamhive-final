export const Moderator = {
  baselineFilter(msg: string): boolean {
    const banned = [/spam/i,/scam/i];
    return !banned.some(rx => rx.test(msg));
  }
};
