import {
  canTransitionDealStage,
  DEFAULT_DEAL_STAGE,
  isDealStage,
} from './deal-stage-policy';

describe('deal stage policy', () => {
  it('defaults new deals to DISCOVERY', () => {
    expect(DEFAULT_DEAL_STAGE).toBe('DISCOVERY');
  });

  it('allows the DISCOVERY identity transition', () => {
    expect(canTransitionDealStage('DISCOVERY', 'DISCOVERY')).toBe(true);
  });

  it('rejects unknown stages', () => {
    expect(isDealStage('CLOSED_WON')).toBe(false);
  });
});
