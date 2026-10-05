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
import { ApiError } from '@/lib/api';
import { useSchoolBranding } from '@/lib/onboarding/queries';
import { useUpdateBranding } from '@/lib/branding/mutations';
import { useLogoUpload } from '@/lib/branding/use-logo-upload';
import { BrandingPreview } from '@/components/branding/branding-preview';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const schema = z.object({
  primaryColor: z
    .string()
    .optional()
    .refine((v) => !v || HEX_COLOR.test(v), 'Enter a colour as #rrggbb.'),
});
type Values = z.infer<typeof schema>;

/**
 * ON-02 (`05 §5.1`, `03 §5`). Logo upload is a real 3-call sequence
 * (`upload-target` → raw `PUT` of the file bytes → `complete`) rather than
 * one endpoint — B4's own design, since the browser must PUT directly to
 * the signed URL. `<BrandingPreview>` reflects the in-progress (unsaved)
 * colour immediately; nothing is persisted until "Save branding" calls
 * `PUT /school/branding`. Always advanceable — `05 §5.2` names no branding
 * requirement for completion.
 */
export function Step02Branding() {
  const branding = useSchoolBranding();
  const updateBranding = useUpdateBranding();
  const logoUpload = useLogoUpload();

  const [pendingLogoId, setPendingLogoId] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { primaryColor: '' },
  });
  const livePrimaryColor = useWatch({ control: form.control, name: 'primaryColor' });

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
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save branding.');
    }
  }

  if (branding.isPending) return <Skeleton className="h-64 w-full" />;

  const previewLogoUrl = logoPreviewUrl ?? branding.data?.logoUrl ?? null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="logo-upload">School logo</Label>
        <input
          id="logo-upload"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={logoUpload.uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onLogoSelected(file);
          }}
          className="block w-full text-sm text-text-secondary file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text-primary hover:file:bg-surface-muted disabled:opacity-50"
        />
        <p className="text-xs text-text-muted">PNG, JPEG or WebP.</p>
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
                      className="h-9 w-9 rounded-md border border-border"
                      aria-label="Pick primary colour"
                    />
                    <Input placeholder="#0057B8" {...field} />
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
          <Button type="submit" loading={updateBranding.isPending}>
            Save branding
          </Button>
        </form>
      </Form>
    </div>
  );
}
