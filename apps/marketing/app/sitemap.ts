import type { MetadataRoute } from 'next';
import { guides } from '@/lib/guides';
import { site } from '@/lib/site';

const pages = [
  ['/', 1],
  ['/features', 0.9],
  ['/how-it-works', 0.8],
  ['/get-started', 0.6],
  ['/exam-day-reliability', 0.8],
  ['/pricing', 0.8],
  ['/request-a-demo', 0.8],
  ['/security', 0.7],
  ['/faq', 0.7],
  ['/guides', 0.6],
  ['/about', 0.5],
  ['/find-your-school', 0.4],
  ['/privacy', 0.2],
  ['/terms', 0.2],
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...pages.map(([path, priority]) => ({
      url: `${site.url}${path === '/' ? '' : path}`,
      priority,
    })),
    ...guides.map((guide) => ({
      url: `${site.url}/guides/${guide.slug}`,
      lastModified: guide.published,
      priority: 0.6,
    })),
  ];
}
