'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Copy, Plus, Save, Tag as TagIcon, X } from 'lucide-react';
import { supportedCurrencies } from '@/config/brand';
import { Button } from '@/components/ui/button';
import { SelectField, TextArea, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch } from '@/lib/client/api-client';
import { formatMoney, parseAmountToCents, sumCents } from '@/lib/money';

import type {
  CategoryOption,
  DuplicateWarning,
  FolderOption,
  ReceiptFormValues,
} from '@/lib/receipts/form-values';

export type { CategoryOption, DuplicateWarning, FolderOption, ReceiptFormValues };

const PAYMENT_OPTIONS = [
  { value: 'UNKNOWN', label: 'Not recorded' },
  { value: 'CARD', label: 'Card' },
  { value: 'CASH', label: 'Cash' },
  { value: 'EFT', label: 'EFT / bank transfer' },
  { value: 'DEBIT_ORDER', label: 'Debit order' },
  { value: 'MOBILE', label: 'Mobile payment' },
  { value: 'OTHER', label: 'Other' },
];

const DOCUMENT_OPTIONS = [
  { value: 'RECEIPT', label: 'Receipt' },
  { value: 'TAX_INVOICE', label: 'Tax invoice' },
  { value: 'OTHER', label: 'Other expense document' },
];

export function ReceiptForm({
  receiptId,
  initialValues,
  categories,
  folders,
  lowConfidenceFields,
  duplicates = [],
  mode,
  ocrFailed = false,
}: {
  receiptId: string;
  initialValues: ReceiptFormValues;
  categories: CategoryOption[];
  folders: FolderOption[];
  lowConfidenceFields: string[];
  duplicates?: DuplicateWarning[];
  mode: 'review' | 'edit';
  ocrFailed?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = useState<ReceiptFormValues>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState(categories);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  const lowConfidence = useMemo(() => new Set(lowConfidenceFields), [lowConfidenceFields]);
  const strongDuplicate = duplicates.find((duplicate) => duplicate.score >= 0.75);
  const blockingDuplicate = mode === 'review' && strongDuplicate && !duplicateAcknowledged;

  const update = <K extends keyof ReceiptFormValues>(key: K, value: ReceiptFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  };

  const totalsMismatch = useMemo(() => {
    const subtotal = parseAmountToCents(values.subtotal, values.currency);
    const tax = parseAmountToCents(values.tax, values.currency);
    const total = parseAmountToCents(values.total, values.currency);
    if (subtotal === null || tax === null || total === null) return null;
    const expected = sumCents([subtotal, tax]);
    return expected === total ? null : expected;
  }, [values.subtotal, values.tax, values.total, values.currency]);

  function addTag(raw: string) {
    const tag = raw.trim().replace(/,$/, '');
    if (!tag) return;
    if (values.tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      setTagDraft('');
      return;
    }
    if (values.tags.length >= 20) return;
    update('tags', [...values.tags, tag]);
    setTagDraft('');
  }

  async function createCategory() {
    const name = newCategory.trim();
    if (!name) return;
    try {
      const result = await apiFetch<{ category: { id: string; name: string } }>('/api/categories', {
        method: 'POST',
        json: { name },
      });
      setCategoryOptions((current) =>
        [...current, { id: result.category.id, name: result.category.name }].sort((a, b) => a.name.localeCompare(b.name)),
      );
      update('categoryId', result.category.id);
      setNewCategory('');
      setAddingCategory(false);
      toast({ title: 'Category added', tone: 'success' });
    } catch (error) {
      toast({
        title: 'Could not add that category',
        description: error instanceof ApiError ? error.message : undefined,
        tone: 'error',
      });
    }
  }

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (values.purchaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(values.purchaseDate)) {
      next.purchaseDate = 'Use the date picker.';
    }
    if (values.purchaseTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(values.purchaseTime)) {
      next.purchaseTime = 'Use a 24-hour time such as 14:30.';
    }
    for (const field of ['subtotal', 'tax', 'total'] as const) {
      const raw = values[field];
      if (raw && parseAmountToCents(raw, values.currency) === null) {
        next[field] = 'Enter an amount such as 245,90.';
      }
    }
    if (mode === 'review' && !values.total.trim()) {
      next.total = 'Add the total so your reports add up.';
    }

    setErrors(next);
    if (Object.keys(next).length > 0) {
      const firstKey = Object.keys(next)[0];
      if (firstKey) document.getElementById(`receipt-${firstKey}`)?.focus();
      return false;
    }
    return true;
  }

  async function save() {
    if (!validate()) return;
    setFormError(null);
    setSaving(true);

    try {
      await apiFetch(`/api/receipts/${receiptId}`, {
        method: 'PATCH',
        json: {
          merchantName: values.merchantName.trim() || null,
          receiptNumber: values.receiptNumber.trim() || null,
          purchaseDate: values.purchaseDate || null,
          purchaseTime: values.purchaseTime || null,
          documentType: values.documentType,
          currency: values.currency,
          subtotal: values.subtotal || null,
          tax: values.tax || null,
          total: values.total || null,
          paymentMethod: values.paymentMethod,
          categoryId: values.categoryId || null,
          folderId: values.folderId || null,
          note: values.note.trim() || null,
          tags: values.tags,
          ...(mode === 'review' ? { status: 'FILED' as const } : {}),
        },
      });

      toast({
        title: mode === 'review' ? 'Everything is safely filed' : 'Changes saved',
        description: mode === 'review' ? 'Your slip is stored and ready for your accountant.' : undefined,
        tone: 'success',
      });

      router.replace(`/slips/${receiptId}`);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fields) setErrors(error.fields);
        setFormError(error.fields ? 'Please check the highlighted fields.' : error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      noValidate
      className="space-y-5"
    >
      {ocrFailed ? (
        <p className="flex items-start gap-2 rounded-lg border border-warning-500/40 bg-warning-50 px-4 py-3 text-sm text-warning-600">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong className="font-semibold">We could not read this one.</strong> Your document is stored safely — just
            fill in the details below and save.
          </span>
        </p>
      ) : lowConfidence.size > 0 ? (
        <p className="flex items-start gap-2 rounded-lg border border-warning-500/40 bg-warning-50 px-4 py-3 text-sm text-warning-600">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong className="font-semibold">Please check the highlighted fields.</strong> We were not confident about
            them, so it is worth a quick look before you save.
          </span>
        </p>
      ) : null}

      {strongDuplicate ? (
        <div
          role="alert"
          className="rounded-lg border border-warning-500/40 bg-warning-50 px-4 py-3.5 text-sm text-warning-600"
        >
          <p className="flex items-start gap-2 font-semibold">
            <Copy aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            This looks like a slip you already have
          </p>
          <p className="mt-1.5 pl-6">
            {strongDuplicate.explanation}{' '}
            {strongDuplicate.merchantName ? `(${strongDuplicate.merchantName}` : ''}
            {strongDuplicate.totalCents !== null
              ? `${strongDuplicate.merchantName ? ', ' : '('}${formatMoney(strongDuplicate.totalCents, strongDuplicate.currency)}`
              : ''}
            {strongDuplicate.merchantName || strongDuplicate.totalCents !== null ? ')' : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 pl-6">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => router.push(`/slips/${strongDuplicate.receiptId}`)}
            >
              View the other slip
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDuplicateAcknowledged(true)}>
              It is a different purchase — keep both
            </Button>
          </div>
        </div>
      ) : null}

      {formError ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger-500/40 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-600">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {formError}
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id="receipt-merchantName"
          label="Shop or supplier"
          value={values.merchantName}
          onChange={(event) => update('merchantName', event.target.value)}
          error={errors.merchantName}
          needsCheck={lowConfidence.has('merchantName')}
          placeholder="Who did you pay?"
          autoComplete="off"
        />
        <TextField
          id="receipt-receiptNumber"
          label="Receipt / invoice number"
          value={values.receiptNumber}
          onChange={(event) => update('receiptNumber', event.target.value)}
          error={errors.receiptNumber}
          needsCheck={lowConfidence.has('receiptNumber')}
          placeholder="Optional"
          autoComplete="off"
        />
        <TextField
          id="receipt-purchaseDate"
          label="Purchase date"
          type="date"
          value={values.purchaseDate}
          onChange={(event) => update('purchaseDate', event.target.value)}
          error={errors.purchaseDate}
          needsCheck={lowConfidence.has('purchaseDate')}
        />
        <TextField
          id="receipt-purchaseTime"
          label="Time"
          type="time"
          value={values.purchaseTime}
          onChange={(event) => update('purchaseTime', event.target.value)}
          error={errors.purchaseTime}
          needsCheck={lowConfidence.has('purchaseTime')}
          hint="Optional"
        />
      </div>

      <fieldset className="rounded-xl border border-line bg-page p-4">
        <legend className="px-1.5 text-sm font-bold text-forest-800">Amounts</legend>

        <div className="grid gap-4 sm:grid-cols-4">
          <SelectField
            id="receipt-currency"
            label="Currency"
            value={values.currency}
            onChange={(event) => update('currency', event.target.value)}
            needsCheck={lowConfidence.has('currency')}
          >
            {supportedCurrencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </SelectField>

          <TextField
            id="receipt-subtotal"
            label="Subtotal"
            inputMode="decimal"
            value={values.subtotal}
            onChange={(event) => update('subtotal', event.target.value)}
            error={errors.subtotal}
            needsCheck={lowConfidence.has('subtotalCents')}
            placeholder="0,00"
          />
          <TextField
            id="receipt-tax"
            label="Tax / VAT"
            inputMode="decimal"
            value={values.tax}
            onChange={(event) => update('tax', event.target.value)}
            error={errors.tax}
            needsCheck={lowConfidence.has('taxCents')}
            placeholder="0,00"
          />
          <TextField
            id="receipt-total"
            label="Total"
            inputMode="decimal"
            required={mode === 'review'}
            value={values.total}
            onChange={(event) => update('total', event.target.value)}
            error={errors.total}
            needsCheck={lowConfidence.has('totalCents')}
            placeholder="0,00"
          />
        </div>

        {totalsMismatch !== null ? (
          <p role="status" className="mt-3 flex items-start gap-2 text-sm text-warning-600">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Subtotal plus tax comes to {formatMoney(totalsMismatch, values.currency)}, which is different from the
              total you entered. That is fine if the slip says so — otherwise it is worth a second look.
            </span>
          </p>
        ) : null}
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <SelectField
            id="receipt-categoryId"
            label="Category"
            value={values.categoryId}
            onChange={(event) => update('categoryId', event.target.value)}
            error={errors.categoryId}
          >
            <option value="">Uncategorised</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectField>

          {addingCategory ? (
            <div className="mt-2 flex gap-2">
              <input
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void createCategory();
                  }
                }}
                aria-label="New category name"
                placeholder="New category name"
                className="h-11 flex-1 rounded-lg border border-ink-300 bg-surface px-3 text-base focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600"
              />
              <Button size="sm" onClick={createCategory}>
                Add
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingCategory(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingCategory(true)}
              className="mt-2 inline-flex items-center gap-1 rounded text-sm font-semibold text-green-700 underline underline-offset-2 hover:text-green-800 focus-visible:ring-2 focus-visible:ring-green-600"
            >
              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
              Add a new category
            </button>
          )}
        </div>

        <SelectField
          id="receipt-folderId"
          label="Folder"
          value={values.folderId}
          onChange={(event) => update('folderId', event.target.value)}
          error={errors.folderId}
          hint="We suggest a folder from the date — change it if you prefer."
        >
          <option value="">Unfiled</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.label}
            </option>
          ))}
        </SelectField>

        <SelectField
          id="receipt-documentType"
          label="Document type"
          value={values.documentType}
          onChange={(event) => update('documentType', event.target.value as ReceiptFormValues['documentType'])}
        >
          {DOCUMENT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>

        <SelectField
          id="receipt-paymentMethod"
          label="Payment method"
          value={values.paymentMethod}
          onChange={(event) => update('paymentMethod', event.target.value)}
          needsCheck={lowConfidence.has('paymentMethod')}
        >
          {PAYMENT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
      </div>

      <div>
        <label htmlFor="receipt-tag-input" className="text-sm font-semibold text-forest-800">
          Tags
        </label>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-ink-300 bg-surface p-2 focus-within:border-green-600 focus-within:ring-2 focus-within:ring-green-600">
          {values.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-mint-100 py-1 pl-2.5 pr-1 text-sm font-medium text-forest-800"
            >
              <TagIcon aria-hidden="true" className="h-3 w-3" />
              {tag}
              <button
                type="button"
                onClick={() => update('tags', values.tags.filter((item) => item !== tag))}
                aria-label={`Remove the tag ${tag}`}
                className="rounded-full p-1 transition-colors hover:bg-mint-300 focus-visible:ring-2 focus-visible:ring-green-600"
              >
                <X aria-hidden="true" className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            id="receipt-tag-input"
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                addTag(tagDraft);
              } else if (event.key === 'Backspace' && !tagDraft && values.tags.length) {
                update('tags', values.tags.slice(0, -1));
              }
            }}
            onBlur={() => addTag(tagDraft)}
            placeholder={values.tags.length ? 'Add another…' : 'e.g. job-142, client-visit'}
            className="min-w-[8rem] flex-1 border-0 bg-transparent px-1.5 py-1 text-base focus:outline-none"
          />
        </div>
        <p className="mt-1.5 text-sm text-ink-500">Press Enter after each tag. Tags make slips easy to search later.</p>
      </div>

      <TextArea
        id="receipt-note"
        label="Note"
        value={values.note}
        onChange={(event) => update('note', event.target.value)}
        placeholder="Anything you want to remember about this purchase"
        rows={3}
      />

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2.5 border-t border-line bg-surface/95 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-sm sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 sm:pb-0 sm:backdrop-blur-none">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push(mode === 'review' ? '/dashboard' : `/slips/${receiptId}`)}
          disabled={saving}
          fullWidth
          className="sm:w-auto"
        >
          {mode === 'review' ? 'Finish later' : 'Cancel'}
        </Button>
        <Button
          type="submit"
          size="lg"
          loading={saving}
          loadingText="Saving…"
          disabled={Boolean(blockingDuplicate)}
          icon={<Save className="h-4 w-4" />}
          fullWidth
          className="sm:w-auto"
        >
          {mode === 'review' ? 'Save and file this slip' : 'Save changes'}
        </Button>
      </div>

      {blockingDuplicate ? (
        <p className="text-right text-sm text-warning-600">
          Choose what to do about the possible duplicate above before saving.
        </p>
      ) : null}
    </form>
  );
}
