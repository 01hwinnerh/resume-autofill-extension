import { describe, expect, it } from 'vitest';

import { FIELD_STATUSES } from '../../../src/shared/form';
import type {
  FieldMatch,
  PageFieldDescriptor,
} from '../../../src/shared/form';

describe('form contracts', () => {
  it('exposes every field status used by the review flow', () => {
    expect(FIELD_STATUSES).toEqual([
      'matched',
      'needs_confirmation',
      'skipped_existing',
      'filled',
      'verified',
      'failed',
      'unsupported',
    ]);
  });

  it('represents a serializable descriptor without a DOM handle', () => {
    const descriptor: PageFieldDescriptor = {
      fieldId: 'field-1',
      kind: 'text',
      label: '联系电话',
      name: 'phone',
      options: [],
      currentValue: null,
      framePath: [],
      fingerprint: 'text|联系电话|phone',
    };

    const match: FieldMatch = {
      descriptor,
      candidates: [],
      status: 'unsupported',
    };

    expect(JSON.parse(JSON.stringify(match))).toEqual(match);
    expect('element' in descriptor).toBe(false);
  });
});
