export const APPLICATION_STAGE_PRESETS = [
  { id: 'applied', label: '已投递' },
  { id: 'written_test', label: '笔试' },
  { id: 'interview_1', label: '一面' },
  { id: 'interview_2', label: '二面' },
  { id: 'final_interview', label: '终面' },
  { id: 'offer', label: 'Offer' },
  { id: 'rejected', label: '未通过' },
  { id: 'withdrawn', label: '已撤回' },
] as const;

export type ApplicationStageId = (typeof APPLICATION_STAGE_PRESETS)[number]['id'] | 'custom';

export interface ApplicationEvent {
  id: string;
  stage: ApplicationStageId;
  label: string;
  occurredAt: string;
  note?: string;
}

export interface ApplicationRecord {
  id: string;
  company: string;
  role: string;
  url: string;
  sourceHost: string;
  appliedAt: string;
  updatedAt: string;
  currentStage: ApplicationStageId;
  currentStageLabel: string;
  events: ApplicationEvent[];
}

export interface NewApplicationRecord {
  company: string;
  role: string;
  url: string;
  sourceHost: string;
  appliedAt?: string;
  note?: string;
}

export interface NewApplicationEvent {
  stage: ApplicationStageId;
  label?: string;
  occurredAt?: string;
  note?: string;
}

export function applicationStageLabel(stage: ApplicationStageId, customLabel?: string): string {
  if (stage === 'custom') return customLabel?.trim() || '自定义阶段';
  return APPLICATION_STAGE_PRESETS.find((item) => item.id === stage)?.label ?? stage;
}
