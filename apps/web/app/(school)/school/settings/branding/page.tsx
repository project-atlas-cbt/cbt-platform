'use client';

import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { BrandingPreview } from '@/components/branding/branding-preview';
import { ApiError } from '@/lib/api';
import { useHasPermission } from '@/lib/nav';
import { useSchoolBranding } from '@/lib/school-settings/queries';
import { useUpdateBranding } from '@/lib/branding/mutations';
import { useLogoUpload } from '@/lib/branding/use-logo-upload';
import { useRegisterFormDirty } from '@/lib/forms/settings-dirty-context';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const schema = z.object({
  primaryColor: z
    .string()
    .optional()
    .refine((v) => !v || HEX_COLOR.test(v), 'Enter a colour as #rrggbb.'),
});
type Values = z.infer<typeof schema>;

/**
 * SET-01 (`05 §6.1`). Reuses F4's exact logo-upload sequence
 * (`useLogoUpload`) and `<BrandingPreview>` — no reimplementation. Saving
 * here also invalidates `['tenant','resolve']` (via `useUpdateBranding`'s
 * own `onSuccess`, `lib/branding/mutations.ts`), which is what repaints
 * `<ThemeProvider>` app-wide immediately, not just on this screen (DoD
 * item 3). Freely editable, audited every time (A-18's resolution) — no
 * "one-time" language anywhere here.
 */
export default function SchoolBrandingSettingsPage() {
  const branding = useSchoolBranding();
  const updateBranding = useUpdateBranding();
  const logoUpload = useLogoUpload();
  const canEdit = useHasPermission('schoolConfig.colour.set');

  const [pendingLogoId, setPendingLogoId] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { primaryColor: '' },
  });
  const livePrimaryColor = useWatch({ control: form.control, name: 'primaryColor' });
  useRegisterFormDirty(form.formState.isDirty || pendingLogoId !== null);

  useEffect(() => {
    if (!branding.data) return;
    form.reset({ primaryColor: branding.data.primaryColor ?? '' });
  }, [branding.data, form]);

  async function onLogoSelected(file: File) {
    const result = await logoUpload.upload(file);
    if (!result) return;
    setPendingLogoId(result.mediaAssetId);
    setLogoPreviewUrl(result.previewUrl);
  }

  async function onSubmit(values: Values) {
    setSaveError(null);
    setSaved(false);
    try {
      await updateBranding.mutateAsync({
        ...(pendingLogoId ? { logoMediaId: pendingLogoId } : {}),
        ...(values.primaryColor ? { primaryColor: values.primaryColor } : {}),
      });
      setSaved(true);
      setPendingLogoId(null);
      form.reset(values);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save branding.');
    }
  }

  if (branding.isPending) return <Skeleton className="h-64 w-full" />;
  if (branding.isError) {
    return <ErrorState error={branding.error} onRetry={() => void branding.refetch()} />;
  }

  const previewLogoUrl = logoPreviewUrl ?? branding.data.logoUrl ?? null;

  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-2">
        <Label htmlFor="logo-upload">School logo</Label>
        <input
          id="logo-upload"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={logoUpload.uploading || !canEdit}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onLogoSelected(file);
          }}
          className="text-sm text-text-secondary"
        />
        {logoUpload.uploading ? <p className="text-sm text-text-muted">Uploading…</p> : null}
        {logoUpload.error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {logoUpload.error}
          </p>
        ) : null}
      </div>

      <Form {...form}>
        <form
          onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
          className="space-y-4"
          noValidate
        >
          <FormField
            control={form.control}
            name="primaryColor"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Primary colour</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={HEX_COLOR.test(field.value ?? '') ? field.value : '#1D4ED8'}
                      onChange={(e) => field.onChange(e.target.value)}
                      disabled={!canEdit}
                      className="h-9 w-9 rounded-md border border-border"
                      aria-label="Pick primary colour"
                    />
                    <Input placeholder="#0057B8" {...field} disabled={!canEdit} />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div>
            <p className="mb-2 text-sm font-medium text-text-primary">Preview School Theme</p>
            <BrandingPreview
              primaryColor={livePrimaryColor || undefined}
              logoUrl={previewLogoUrl}
            />
          </div>

          {saveError ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {saveError}
            </p>
          ) : null}
          {saved ? <p className="text-sm text-success">Branding saved.</p> : null}
          {canEdit ? (
            <Button type="submit" loading={updateBranding.isPending}>
              Save branding
            </Button>
          ) : (
            <p className="text-sm text-text-muted">You have view-only access to branding.</p>
          )}
        </form>
      </Form>
    </div>
  );
}
