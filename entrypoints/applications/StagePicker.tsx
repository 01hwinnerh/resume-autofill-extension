import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { APPLICATION_STAGE_PRESETS, applicationStageLabel, type ApplicationStageId } from '../../src/shared/application-record';

const STAGE_OPTIONS = [
  ...APPLICATION_STAGE_PRESETS,
  { id: 'custom', label: '自定义阶段' },
] satisfies ReadonlyArray<{ id: ApplicationStageId; label: string }>;

interface StagePickerProps {
  value: ApplicationStageId;
  onChange(value: ApplicationStageId): void;
  label?: string;
}

export function StagePicker({ value, onChange, label = '阶段' }: StagePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    if (!open) return;
    const selected = listRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    selected?.focus();

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [open]);

  function selectStage(stage: ApplicationStageId) {
    onChange(stage);
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const options = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | undefined;
    if (event.key === 'ArrowDown') nextIndex = Math.min(currentIndex + 1, options.length - 1);
    if (event.key === 'ArrowUp') nextIndex = Math.max(currentIndex - 1, 0);
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = options.length - 1;
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (nextIndex !== undefined) {
      event.preventDefault();
      options[nextIndex]?.focus();
    }
  }

  return <div className="stage-picker" ref={rootRef}>
    <button
      ref={triggerRef}
      type="button"
      className="stage-picker-trigger"
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={listboxId}
      onClick={() => setOpen((current) => !current)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          setOpen(true);
        }
      }}
    >
      <span>{applicationStageLabel(value)}</span>
      <i aria-hidden="true">⌄</i>
    </button>
    {open && <div id={listboxId} ref={listRef} className="stage-picker-menu" role="listbox" aria-label={`${label}选项`} onKeyDown={onListKeyDown}>
      {STAGE_OPTIONS.map((option) => <button
        key={option.id}
        type="button"
        role="option"
        aria-selected={option.id === value}
        className="stage-picker-option"
        onClick={() => selectStage(option.id)}
      >
        <span>{option.label}</span>
        {option.id === value && <i aria-hidden="true">✓</i>}
      </button>)}
    </div>}
  </div>;
}
