import { shouldRollOverToNextCycle } from './issue';

describe('Issue Domain Logic', () => {
  it('identifies status categories that roll over to the next cycle', () => {
    expect(shouldRollOverToNextCycle('UNSTARTED')).toBe(true);
    expect(shouldRollOverToNextCycle('STARTED')).toBe(true);
    expect(shouldRollOverToNextCycle('BACKLOG')).toBe(false);
    expect(shouldRollOverToNextCycle('COMPLETED')).toBe(false);
    expect(shouldRollOverToNextCycle('CANCELED')).toBe(false);
    expect(shouldRollOverToNextCycle('DUPLICATE')).toBe(false);
  });
});
