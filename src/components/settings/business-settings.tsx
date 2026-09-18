'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Plus, Trash2 } from 'lucide-react';
import { supportedCurrencies } from '@/config/brand';
import { Button, IconButton } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { SelectField, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch } from '@/lib/client/api-client';
import { MONTH_NAMES } from '@/lib/folders';
import { currencyMeta, formatMoney } from '@/lib/money';

export interface BusinessValues {
  name: string;
  currency: string;
  financialYearStartMonth: number;
  folderStructure: 'YEAR_MONTH' | 'YEAR_MONTH_CATEGORY' | 'CATEGORY_ONLY';
  phone: string;
  vatNumber: string;
  addressLine: string;
}

const STRUCTURE_OPTIONS = [
  { value: 'YEAR_MONTH', label: 'Year › Month', hint: '2026 › January — the usual choice.' },
  { value: 'YEAR_MONTH_CATEGORY', label: 'Year › Month › Category', hint: 'Adds a category folder inside each month.' },
  { value: 'CATEGORY_ONLY', label: 'Category only', hint: 'One folder per category, no date folders.' },
];

export function BusinessSettings({ business }: { business: BusinessValues }) {
  const router = useRouter();
  const { update } = useSession();
  const { toast } = useToast();
  const [form, setForm] = useState(business);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setSaving(true);
    try {
      await apiFetch('/api/business', {
        method: 'PATCH',
        json: {
          name: form.name,
          currency: form.currency,
          financialYearStartMonth: form.financialYearStartMonth,
          folderStructure: form.folderStructure,
          phone: form.phone,
          vatNumber: form.vatNumber,
          addressLine: form.addressLine,
        },
      });
      await update();
      toast({ title: 'Business details saved', tone: 'success' });
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.fields) setErrors(error.fields);
      else
        toast({
          title: 'We could not save that',
          description: error instanceof ApiError ? error.message : undefined,
          tone: 'error',
        });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="business-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <h2 id="business-heading" className="text-lg font-bold text-forest-900">
        Business details
      </h2>
      <p className="mt-1 text-sm text-ink-500">These appear on your exports and the PDFs you send to your accountant.</p>

      <form onSubmit={save} noValidate className="mt-4 space-y-4">
        <TextField
          label="Business name"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          error={errors.name}
          autoComplete="organization"
          required
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Business telephone"
            type="tel"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
            error={errors.phone}
            hint="Optional"
          />
          <TextField
            label="VAT number"
            value={form.vatNumber}
            onChange={(event) => setForm({ ...form, vatNumber: event.target.value })}
            error={errors.vatNumber}
            hint="Optional"
          />
        </div>

        <TextField
          label="Address"
          value={form.addressLine}
          onChange={(event) => setForm({ ...form, addressLine: event.target.value })}
          error={errors.addressLine}
          hint="Optional"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Default currency"
            value={form.currency}
            onChange={(event) => setForm({ ...form, currency: event.target.value })}
            error={errors.currency}
            hint={`Shown as ${formatMoney(123456, form.currency)}`}
          >
            {supportedCurrencies.map((code) => (
              <option key={code} value={code}>
                {code} — {currencyMeta(code).name}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Financial year starts in"
            value={String(form.financialYearStartMonth)}
            onChange={(event) => setForm({ ...form, financialYearStartMonth: Number(event.target.value) })}
            error={errors.financialYearStartMonth}
            hint="March is the usual choice for South African businesses."
          >
            {MONTH_NAMES.map((month, index) => (
              <option key={month} value={index + 1}>
                {month}
              </option>
            ))}
          </SelectField>
        </div>

        <fieldset>
          <legend className="text-sm font-semibold text-forest-800">How new slips are filed</legend>
          <div className="mt-2 space-y-2">
            {STRUCTURE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors ${
                  form.folderStructure === option.value
                    ? 'border-green-600 bg-mint-50'
                    : 'border-line bg-surface hover:border-ink-300'
                }`}
              >
                <input
                  type="radio"
                  name="folderStructure"
                  value={option.value}
                  checked={form.folderStructure === option.value}
                  onChange={() => setForm({ ...form, folderStructure: option.value as BusinessValues['folderStructure'] })}
                  className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-ink-300 bg-surface checked:border-[6px] checked:border-green-600 focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
                />
                <span className="min-w-0">
                  <span className="block font-semibold text-forest-900">{option.label}</span>
                  <span className="block text-sm text-ink-500">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-sm text-ink-500">
            Changing this affects new slips. Anything already filed stays where it is.
          </p>
        </fieldset>

        <div className="flex justify-end">
          <Button type="submit" loading={saving} loadingText="Saving…">
            Save business details
          </Button>
        </div>
      </form>
    </section>
  );
}

export interface CategoryRow {
  id: string;
  name: string;
  isDefault: boolean;
  usageCount: number;
}

export function CategoryManager({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<CategoryRow | null>(null);
  const [working, setWorking] = useState(false);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setAdding(true);
    try {
      await apiFetch('/api/categories', { method: 'POST', json: { name: name.trim() } });
      setName('');
      toast({ title: 'Category added', tone: 'success' });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? (caught.fields?.name ?? caught.message) : 'That did not work.');
    } finally {
      setAdding(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setWorking(true);
    try {
      const result = await apiFetch<{ slipsUsingIt: number }>(`/api/categories/${removing.id}`, { method: 'DELETE' });
      toast({
        title: 'Category removed',
        description:
          result.slipsUsingIt > 0
            ? `${result.slipsUsingIt} slip${result.slipsUsingIt === 1 ? '' : 's'} kept their category for your records.`
            : undefined,
        tone: 'success',
      });
      setRemoving(null);
      router.refresh();
    } catch (caught) {
      toast({
        title: 'We could not remove that category',
        description: caught instanceof ApiError ? caught.message : undefined,
        tone: 'error',
      });
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <section aria-labelledby="categories-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
        <h2 id="categories-heading" className="text-lg font-bold text-forest-900">
          Receipt categories
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Categories keep your reporting tidy. Removing one keeps it on slips that already use it.
        </p>

        <ul className="mt-4 divide-y divide-line">
          {categories.map((category) => (
            <li key={category.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate font-medium text-charcoal">{category.name}</span>
                <span className="block text-xs text-ink-500">
                  {category.usageCount} slip{category.usageCount === 1 ? '' : 's'}
                </span>
              </span>
              <IconButton
                label={`Remove ${category.name}`}
                size="sm"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => setRemoving(category)}
              />
            </li>
          ))}
        </ul>

        <form onSubmit={add} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <TextField
            label="New category"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={error ?? undefined}
            placeholder="e.g. Tools & hardware"
            containerClassName="flex-1"
          />
          <Button type="submit" loading={adding} icon={<Plus className="h-4 w-4" />} className="sm:mb-0">
            Add
          </Button>
        </form>
      </section>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        loading={working}
        tone="danger"
        title={`Remove “${removing?.name ?? ''}”?`}
        description="It stops being offered for new slips. Slips already using it keep their category."
        confirmLabel="Remove category"
      />
    </>
  );
}
