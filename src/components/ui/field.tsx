'use client';

import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { cn } from '@/lib/cn';

const controlBase =
  'w-full rounded-lg border bg-surface px-3.5 text-base text-charcoal shadow-[inset_0_1px_2px_hsl(150_18%_13%/0.03)] ' +
  'transition-colors placeholder:text-ink-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-1 focus:ring-offset-surface focus:border-green-600 ' +
  'disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-500';

const controlState = (invalid?: boolean) =>
  invalid ? 'border-danger-500 focus:ring-danger-500 focus:border-danger-500' : 'border-ink-300 hover:border-ink-400';

interface FieldShellProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  /** Renders the "check this" treatment for low-confidence OCR fields. */
  needsCheck?: boolean;
  children: ReactNode;
  className?: string;
}

export function FieldShell({ id, label, hint, error, required, needsCheck, children, className }: FieldShellProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-forest-800">
          {label}
          {required ? (
            <span className="ml-1 text-danger-600" aria-hidden="true">
              *
            </span>
          ) : null}
          {required ? <span className="sr-only"> (required)</span> : null}
        </label>
        {needsCheck ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2 py-0.5 text-2xs font-semibold text-warning-600">
            <AlertCircle aria-hidden="true" className="h-3 w-3" />
            Please check
          </span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="flex items-start gap-1.5 text-sm font-medium text-danger-600">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: ReactNode;
  error?: string;
  needsCheck?: boolean;
  id?: string;
  containerClassName?: string;
  prefix?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, needsCheck, id, containerClassName, className, required, prefix, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <FieldShell
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      needsCheck={needsCheck}
      className={containerClassName}
    >
      <div className="relative">
        {prefix ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-medium text-ink-500"
          >
            {prefix}
          </span>
        ) : null}
        <input
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          className={cn(
            controlBase,
            controlState(Boolean(error)),
            'h-12',
            prefix && 'pl-9',
            needsCheck && !error && 'border-warning-500 bg-warning-50/40',
            className,
          )}
          {...props}
        />
      </div>
    </FieldShell>
  );
});

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  hint?: ReactNode;
  error?: string;
  id?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, id, className, required, rows = 3, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={required}>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn(controlBase, controlState(Boolean(error)), 'py-3 leading-relaxed', className)}
        {...props}
      />
    </FieldShell>
  );
});

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  hint?: ReactNode;
  error?: string;
  needsCheck?: boolean;
  id?: string;
  containerClassName?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, hint, error, needsCheck, id, className, containerClassName, required, children, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <FieldShell
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      needsCheck={needsCheck}
      className={containerClassName}
    >
      <select
        ref={ref}
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn(
          controlBase,
          controlState(Boolean(error)),
          'h-12 appearance-none bg-[length:18px] bg-[right_0.9rem_center] bg-no-repeat pr-10',
          needsCheck && !error && 'border-warning-500 bg-warning-50/40',
          className,
        )}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%235A6B62' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  label: ReactNode;
  error?: string;
  id?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, error, id, className, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-3">
        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
          <input
            ref={ref}
            id={fieldId}
            type="checkbox"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${fieldId}-error` : undefined}
            className={cn(
              'peer h-6 w-6 cursor-pointer appearance-none rounded-md border-2 border-ink-300 bg-surface transition-colors',
              'checked:border-green-600 checked:bg-green-600 hover:border-ink-400 checked:hover:bg-green-700',
              'focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-55',
              error && 'border-danger-500',
              className,
            )}
            {...props}
          />
          <Check
            aria-hidden="true"
            className="pointer-events-none absolute h-4 w-4 text-white opacity-0 transition-opacity peer-checked:opacity-100"
          />
        </span>
        <label htmlFor={fieldId} className="cursor-pointer text-sm leading-6 text-charcoal">
          {label}
        </label>
      </div>
      {error ? (
        <p id={`${fieldId}-error`} role="alert" className="flex items-center gap-1.5 pl-9 text-sm font-medium text-danger-600">
          <AlertCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
});

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}

export function Switch({ checked, onChange, label, description, disabled, id }: SwitchProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0">
        <label htmlFor={fieldId} className="block text-sm font-semibold text-forest-800">
          {label}
        </label>
        {description ? (
          <p id={`${fieldId}-description`} className="mt-0.5 text-sm text-ink-500">
            {description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        id={fieldId}
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${fieldId}-description` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-55',
          checked ? 'bg-green-600' : 'bg-ink-300',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}
