import { describe, expect, it } from 'vitest';
import { applicationStageTone } from '../../../src/shared/application-record';

describe('applicationStageTone', () => {
  it('uses green for offer, red for terminal outcomes, and blue for active stages', () => {
    expect(applicationStageTone('offer', 'Offer')).toBe('green');
    expect(applicationStageTone('rejected', '未通过')).toBe('red');
    expect(applicationStageTone('withdrawn', '已撤回')).toBe('red');
    expect(applicationStageTone('assessment', '测评')).toBe('blue');
    expect(applicationStageTone('interview_2', '二面')).toBe('blue');
  });

  it('recognizes custom offer outcomes without treating rejected offers as green', () => {
    expect(applicationStageTone('custom', '接受 Offer')).toBe('green');
    expect(applicationStageTone('custom', '拒绝 Offer')).toBe('red');
    expect(applicationStageTone('custom', '流程终止')).toBe('red');
    expect(applicationStageTone('custom', 'HR 沟通')).toBe('blue');
  });
});
