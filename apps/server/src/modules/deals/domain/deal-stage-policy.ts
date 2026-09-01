import { DEAL_STAGES, type DealStage } from './deal';

export const DEFAULT_DEAL_STAGE: DealStage = 'DISCOVERY';

export const isDealStage = (value: string): value is DealStage =>
  DEAL_STAGES.some((stage) => stage === value);

export const canTransitionDealStage = (
  current: DealStage,
  next: DealStage,
): boolean => current === next;
