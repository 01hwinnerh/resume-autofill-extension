import { afterEach, describe, expect, it, vi } from 'vitest';
import { highlightField } from '../../../src/form-engine/focus-field';

afterEach(() => vi.useRealTimers());

describe('highlightField', () => {
  it('scrolls to, highlights, and restores the target control', () => {
    vi.useFakeTimers();
    const input = document.createElement('input');
    input.style.outline = '1px solid red';
    input.scrollIntoView = vi.fn();

    highlightField(input, 100);

    expect(input.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    expect(input.style.outline).toBe('3px solid #1677ff');
    vi.advanceTimersByTime(100);
    expect(input.style.outline).toBe('1px solid red');
  });
});
