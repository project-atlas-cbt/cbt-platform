/**
 * Everything about the business that is not copy: the product name, the
 * domain and the contact details. PROJECT.md: the product name is never
 * hardcoded, so it comes from PRODUCT_NAME like the rest of the platform;
 * the domain from PLATFORM_ROOT_DOMAIN, which is the same root the school
 * subdomains hang off (docs/operations/domain-plan.md).
 *
 * Contact details and the starting price are optional. When one is unset,
 * the page that would show it leaves it out instead of showing a
 * placeholder, so the site is safe to deploy before every detail exists.
 */
export interface SiteConfig {
  name: string;
  rootDomain: string;
  url: string;
  email?: string | undefined;
  phone?: string | undefined;
  /** International digits without "+", e.g. 2348012345678; a local 0803… number is converted. */
  whatsapp?: string | undefined;
  address?: string | undefined;
  /** The company that owns and sells the product (copyright, About, privacy). */
  company?: string | undefined;
  /** Starting price per student per year, in naira. */
  priceFromNgn?: number | undefined;
  /** The founder named on About; their photo is public/team/founder.jpg. */
  founder?: string | undefined;
  /** Show the founding-school offer on Pricing (the first 10 schools); off unless set. */
  foundingOffer: boolean;
}

/** A Nigerian local number (0803…) in international digits (234803…). */
function internationalDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('0') ? `234${digits.slice(1)}` : digits;
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function readSiteConfig(env: Record<string, string | undefined> = process.env): SiteConfig {
  const name = optional(env.PRODUCT_NAME) ?? 'CBT Platform';
  const rootDomain = optional(env.PLATFORM_ROOT_DOMAIN) ?? 'localtest.me';
  const local = rootDomain === 'localtest.me' || rootDomain === 'localhost';
  const url =
    optional(env.MARKETING_SITE_URL) ?? (local ? 'http://localhost:3100' : `https://${rootDomain}`);
  const whatsapp = internationalDigits(optional(env.MARKETING_WHATSAPP) ?? '');
  const price = Number(optional(env.MARKETING_PRICE_FROM_NGN));

  return {
    name,
    rootDomain,
    url: url.replace(/\/$/, ''),
    email: optional(env.MARKETING_CONTACT_EMAIL),
    phone: optional(env.MARKETING_CONTACT_PHONE),
    whatsapp: whatsapp || undefined,
    address: optional(env.MARKETING_CONTACT_ADDRESS),
    company: optional(env.MARKETING_COMPANY_NAME),
    priceFromNgn: Number.isFinite(price) && price > 0 ? price : undefined,
    founder: optional(env.MARKETING_FOUNDER_NAME),
    foundingOffer: ['1', 'true', 'yes'].includes(
      optional(env.MARKETING_FOUNDING_OFFER)?.toLowerCase() ?? '',
    ),
  };
}

export const site = readSiteConfig();

export function whatsappLink(config: SiteConfig, text?: string): string | undefined {
  if (!config.whatsapp) return undefined;
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${config.whatsapp}${query}`;
}

/** A `tel:` link that dials from outside Nigeria too. */
export function telHref(phone: string): string {
  return `tel:+${internationalDigits(phone)}`;
}

export function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG')}`;
}
