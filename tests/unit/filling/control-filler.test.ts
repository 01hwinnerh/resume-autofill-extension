import { describe, expect, it, vi } from 'vitest';

import { selectComboboxOption } from '../../../src/filling/combobox-control';
import { fillField } from '../../../src/filling/control-filler';
import type { RuntimePageField } from '../../../src/form-engine/runtime-types';
import type { PageFieldKind } from '../../../src/shared/form';
import { verifyField } from '../../../src/filling/verify-field';

function fieldFor(markup: string, kind: PageFieldKind): RuntimePageField {
  document.body.innerHTML = markup;
  const elements = Array.from(document.querySelectorAll('input, textarea, select')) as HTMLElement[];
  return {
    fieldId: 'field-1',
    kind,
    label: 'Test field',
    options: [],
    currentValue: null,
    framePath: [],
    fingerprint: 'test-field',
    elements,
  };
}

function observeEvents(element: HTMLElement, eventTypes: Array<'input' | 'change'>): string[] {
  const events: string[] = [];
  for (const type of eventTypes) {
    element.addEventListener(type, (event) => {
      events.push(`${event.type}:${event.bubbles}`);
    });
  }
  return events;
}

describe('fillField', () => {
  it('refuses controls that require a site-specific manual interaction', async () => {
    const field = fieldFor('<input type="search" role="combobox">', 'text');
    field.manualOnly = true;

    await expect(fillField(field, '本科', { overwrite: false, confirmed: true }))
      .resolves.toEqual({ status: 'failed', fieldId: 'field-1', reason: 'control requires manual interaction' });
    expect((field.elements[0] as HTMLInputElement).value).toBe('');
  });

  it('selects and verifies one exact combobox option', async () => {
    const field = fieldFor(`
      <div data-form-field-id="degree"><span class="selection-item"></span><input type="search" role="combobox" aria-controls="degree-options"></div>
      <div id="degree-options" role="listbox"><div role="option">本科</div><div role="option">硕士</div></div>
    `, 'combobox');
    const selected = document.querySelector<HTMLElement>('.selection-item')!;
    document.querySelector<HTMLElement>('[role="option"]')!.addEventListener('click', () => { selected.textContent = '本科'; });

    await expect(fillField(field, '本科', { overwrite: false, confirmed: true }))
      .resolves.toEqual({ status: 'filled', fieldId: 'field-1' });
    expect(verifyField(field, '本科')).toEqual({ fieldId: 'field-1', verified: true });
  });

  it('rejects ambiguous combobox options without clicking either option', async () => {
    const field = fieldFor(`
      <input type="search" role="combobox" aria-controls="degree-options">
      <div id="degree-options" role="listbox"><div role="option">本科</div><div role="option">本科</div></div>
    `, 'combobox');
    const clicks: number[] = [];
    document.querySelectorAll<HTMLElement>('[role="option"]').forEach((option) => option.addEventListener('click', () => clicks.push(1)));

    await expect(fillField(field, '本科', { overwrite: false, confirmed: true }))
      .resolves.toEqual({ status: 'failed', fieldId: 'field-1', reason: 'combobox option match is ambiguous' });
    expect(clicks).toHaveLength(0);
    expect((field.elements[0] as HTMLInputElement).value).toBe('');
  });

  it.each([
    ['text input', '<input>', 'text'],
    ['textarea', '<textarea></textarea>', 'textarea'],
  ] as const)('fills a blank %s through native writes and emits bubbling events', async (_name, markup, kind) => {
    const field = fieldFor(markup, kind);
    const element = field.elements[0] as HTMLInputElement | HTMLTextAreaElement;
    const events = observeEvents(element, ['input', 'change']);

    await expect(fillField(field, '  Lin  ', { overwrite: false, confirmed: true }))
      .resolves.toEqual({ status: 'filled', fieldId: 'field-1' });

    expect(element.value).toBe('  Lin  ');
    expect(events).toEqual(['input:true', 'change:true']);
  });

  it('rejects an invalid date value without touching the date input', async () => {
    const field = fieldFor('<input type="date">', 'text');
    const element = field.elements[0] as HTMLInputElement;
    const events = observeEvents(element, ['input', 'change']);

    await expect(fillField(field, '硕士研究生', { overwrite: false, confirmed: true }))
      .resolves.toEqual({ status: 'failed', fieldId: 'field-1', reason: 'date input requires a valid YYYY-MM-DD value' });

    expect(element.value).toBe('');
    expect(events).toEqual([]);
  });

  it('fills a date input only when the value uses a valid YYYY-MM-DD date', async () => {
    const field = fieldFor('<input type="date">', 'text');
    const element = field.elements[0] as HTMLInputElement;

    await expect(fillField(field, '2026-02-28', { overwrite: false, confirmed: true }))
      .resolves.toEqual({ status: 'filled', fieldId: 'field-1' });
    expect(element.value).toBe('2026-02-28');

    const invalidField = fieldFor('<input type="date">', 'text');
    await expect(fillField(invalidField, '2026-02-30', { overwrite: false, confirmed: true }))
      .resolves.toMatchObject({ status: 'failed' });
  });

  it('adapts a full profile date to a month input and verifies it', async () => {
    const field = fieldFor('<input type="month">', 'text');
    const element = field.elements[0] as HTMLInputElement;

    await expect(fillField(field, '2026-09-08', { overwrite: false, confirmed: true }))
      .resolves.toEqual({ status: 'filled', fieldId: 'field-1' });
    expect(element.value).toBe('2026-09');
    expect(verifyField(field, '2026-09-08')).toEqual({ fieldId: 'field-1', verified: true });
  });

  it('normalizes slash-separated dates before writing date controls', async () => {
    const field = fieldFor('<input type="date">', 'text');
    const element = field.elements[0] as HTMLInputElement;

    await expect(fillField(field, '2026/9/8', { overwrite: false, confirmed: true }))
      .resolves.toEqual({ status: 'filled', fieldId: 'field-1' });
    expect(element.value).toBe('2026-09-08');
    expect(verifyField(field, '2026/9/8')).toEqual({ fieldId: 'field-1', verified: true });
  });

  it('selects a blank select by option value and emits bubbling events', async () => {
    const field = fieldFor('<select><option value="">Choose</option><option value="engineer">Engineer</option></select>', 'select');
    const element = field.elements[0] as HTMLSelectElement;
    const events = observeEvents(element, ['input', 'change']);

    await expect(fillField(field, 'engineer', { overwrite: false, confirmed: true }))
      .resolves.toEqual({ status: 'filled', fieldId: 'field-1' });

    expect(element.value).toBe('engineer');
    expect(events).toEqual(['input:true', 'change:true']);
  });

  it('selects a blank select by normalized visible label and emits bubbling events', async () => {
    const field = fieldFor('<select><option value="">Choose</option><option value="se"> Senior   Engineer </option></select>', 'select');
    const element = field.elements[0] as HTMLSelectElement;
    const events = observeEvents(element, ['input', 'change']);

    await expect(fillField(field, 'senior engineer', { overwrite: false, confirmed: true }))
      .resolves.toEqual({ status: 'filled', fieldId: 'field-1' });

    expect(element.value).toBe('se');
    expect(events).toEqual(['input:true', 'change:true']);
  });

  it('verifies a select filled through normalized visible label fallback', async () => {
    const field = fieldFor('<select><option value="">Choose</option><option value="se"> Senior   Engineer </option></select>', 'select');

    await expect(fillField(field, 'senior engineer', { overwrite: false, confirmed: true }))
      .resolves.toEqual({ status: 'filled', fieldId: 'field-1' });

    expect(verifyField(field, 'senior engineer')).toEqual({ fieldId: 'field-1', verified: true });
  });

  it('checks only the requested blank radio option and emits a bubbling change event', async () => {
    const field = fieldFor('<input type="radio" name="mode" value="remote"><input type="radio" name="mode" value="office">', 'radio');
    const [remote, office] = field.elements as HTMLInputElement[];
    const events = observeEvents(office, ['change']);

    await expect(fillField(field, 'office', { overwrite: false, confirmed: true }))
      .resolves.toEqual({ status: 'filled', fieldId: 'field-1' });

    expect(remote.checked).toBe(false);
    expect(office.checked).toBe(true);
    expect(events).toEqual(['change:true']);
  });

  it('sets a blank checkbox to the requested boolean and emits a bubbling change event', async () => {
    const field = fieldFor('<input type="checkbox">', 'checkbox');
    const element = field.elements[0] as HTMLInputElement;
    const events = observeEvents(element, ['change']);

    await expect(fillField(field, true, { overwrite: false, confirmed: true }))
      .resolves.toEqual({ status: 'filled', fieldId: 'field-1' });

    expect(element.checked).toBe(true);
    expect(events).toEqual(['change:true']);
  });

  it('does not overwrite an existing value by default', async () => {
    const field = fieldFor('<input value="existing">', 'text');
    const element = field.elements[0] as HTMLInputElement;
    const events = observeEvents(element, ['input', 'change']);
    await expect(fillField(field, 'new', {
      overwrite: false,
      confirmed: true,
    })).resolves.toMatchObject({ status: 'skipped_existing' });
    expect(element.value).toBe('existing');
    expect(events).toEqual([]);
  });

  it('rejects an unconfirmed fill without changing the field', async () => {
    const field = fieldFor('<input>', 'text');
    const element = field.elements[0] as HTMLInputElement;
    const events = observeEvents(element, ['input', 'change']);

    await expect(fillField(field, 'Lin', { overwrite: false, confirmed: false }))
      .resolves.toMatchObject({ status: 'failed', fieldId: 'field-1' });

    expect(element.value).toBe('');
    expect(events).toEqual([]);
  });

  it('does not assign a file input value', async () => {
    const field = fieldFor('<input type="file">', 'text');
    const element = field.elements[0] as HTMLInputElement;
    const events = observeEvents(element, ['input', 'change']);

    await expect(fillField(field, 'resume.pdf', { overwrite: true, confirmed: true }))
      .resolves.toMatchObject({ status: 'failed', fieldId: 'field-1' });

    expect(element.value).toBe('');
    expect(events).toEqual([]);
  });

  it.each([
    ['YYYY-MM', 'YYYY-MM', '2026-09-17', '2026-09'],
    ['MM/YYYY', 'MM/YYYY', '2026-09', '09/2026'],
    ['MM-YYYY', 'MM-YYYY', '2026年9月', '09-2026'],
    ['YYYY.MM', 'YYYY.MM', '09/2026', '2026.09'],
    ['YYYY年MM月', 'YYYY年MM月', '2026.9', '2026年09月'],
    ['YYYY.MM.DD', 'YYYY.MM.DD', '09/17/2026', '2026.09.17'],
    ['YYYY/MM/DD', 'YYYY/MM/DD', '2026-09-17', '2026/09/17'],
    ['MM/DD/YYYY', 'MM/DD/YYYY', '2026.9.17', '09/17/2026'],
  ])('converts profile dates to %s text controls', async (_name, placeholder, value, expected) => {
    const field = fieldFor(`<input placeholder="${placeholder}">`, 'text');
    await expect(fillField(field, value, { overwrite: false, confirmed: true })).resolves.toMatchObject({ status: 'filled' });
    expect((field.elements[0] as HTMLInputElement).value).toBe(expected);
  });

  it('allows present status only in text controls and rejects it for native month', async () => {
    await expect(fillField(fieldFor('<input placeholder="YYYY年MM月">', 'text'), '至今', { overwrite: false, confirmed: true }))
      .resolves.toMatchObject({ status: 'filled' });
    await expect(fillField(fieldFor('<input type="month">', 'text'), '至今', { overwrite: false, confirmed: true }))
      .resolves.toMatchObject({ status: 'failed' });
  });

  it('waits for a slow body portal combobox and cleans up after an exact match', async () => {
    const field = fieldFor('<input id="degree" type="search" role="combobox">', 'combobox');
    const control = field.elements[0] as HTMLInputElement;
    control.addEventListener('click', () => setTimeout(() => {
      const portal = document.createElement('div');
      portal.setAttribute('role', 'listbox');
      portal.innerHTML = '<button role="option">本科</button>';
      portal.querySelector('button')!.addEventListener('click', () => control.setAttribute('aria-valuetext', '本科'));
      document.body.append(portal);
    }, 80), { once: true });

    await expect(fillField(field, '本科', { overwrite: false, confirmed: true })).resolves.toMatchObject({ status: 'filled' });
  });

  it('does not invent a day when a native date receives only year and month', async () => {
    const field = fieldFor('<input type="date">', 'text');
    await expect(fillField(field, '2026-09', { overwrite: false, confirmed: true })).resolves.toEqual({
      status: 'failed',
      fieldId: 'field-1',
      reason: '原值仅包含年月，原生日期控件需要具体日期（YYYY-MM-DD），请确认“日”后重试。',
    });
    expect((field.elements[0] as HTMLInputElement).value).toBe('');
  });

  it('cleans the combobox observer and timeout when bounded waiting expires', async () => {
    vi.useFakeTimers();
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    try {
      document.body.innerHTML = '<input type="search" role="combobox">';
      const control = document.querySelector<HTMLInputElement>('input')!;
      const selection = selectComboboxOption(control, '不存在', { timeoutMs: 800 });
      await vi.advanceTimersByTimeAsync(800);
      await expect(selection).resolves.toEqual({ selected: false, reason: 'combobox has no exact option match' });
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(clearTimeoutSpy).toHaveBeenCalled();
      expect(control.value).toBe('');
    } finally {
      clearTimeoutSpy.mockRestore();
      disconnect.mockRestore();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('does not report success when blur validation rolls a controlled value back', async () => {
    const field = fieldFor('<input>', 'text');
    const control = field.elements[0] as HTMLInputElement;
    control.addEventListener('blur', () => { control.value = ''; });
    await expect(fillField(field, 'Lin', { overwrite: false, confirmed: true }))
      .resolves.toEqual({ status: 'failed', fieldId: 'field-1', reason: 'current value does not match expected value' });
  });
});
