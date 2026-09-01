export const DEAL_STAGES = ['DISCOVERY'] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export interface Deal {
  id: string;
  workspaceId: string;
  companyId: string | null;
  title: string;
  amount: string;
  currency: string;
  stage: DealStage;
  closeDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
