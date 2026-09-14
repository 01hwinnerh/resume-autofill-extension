import { describe, expect, it } from 'vitest';

import {
  resolveLabel,
  resolveSectionLabel,
} from '../../../src/form-engine/label-resolver';

describe('label resolver', () => {
  it('uses the first available semantic label source in the documented order', () => {
    document.body.innerHTML = `
      <label for="name">  Full   Name </label>
      <label>Outer label <input id="name" aria-label="Aria name" placeholder="Placeholder name" /></label>
      <input id="placeholder" placeholder="  Personal   Site " />
      <input id="fallback-id" name="Preferred_Name" />
      <input id="only-id" />
    `;

    expect(resolveLabel(document.querySelector('#name')!)).toBe('full name');
    expect(resolveLabel(document.querySelector('#placeholder')!)).toBe('personal site');
    expect(resolveLabel(document.querySelector('#fallback-id')!)).toBe('preferred_name');
    expect(resolveLabel(document.querySelector('#only-id')!)).toBe('only-id');
  });

  it('uses only explicit semantic section context', () => {
    document.body.innerHTML = `
      <fieldset><legend>  基本   信息 </legend><input id="legend-field" /></fieldset>
      <div role="group" title=" Contact   Details "><input id="group-field" /></div>
      <section><h2>  Work   History </h2><input id="section-field" /></section>
      <div>Unrelated parent copy <input id="plain-field" /></div>
    `;

    expect(resolveSectionLabel(document.querySelector('#legend-field')!)).toBe('基本 信息');
    expect(resolveSectionLabel(document.querySelector('#group-field')!)).toBe('contact details');
    expect(resolveSectionLabel(document.querySelector('#section-field')!)).toBe('work history');
    expect(resolveSectionLabel(document.querySelector('#plain-field')!)).toBeUndefined();
  });
});
