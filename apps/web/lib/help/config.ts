/**
 * ADR-0035 decisions 6 and 7. The product name comes from PRODUCT_NAME
 * (re-exposed as NEXT_PUBLIC_PRODUCT_NAME in next.config.ts), and the
 * support contacts from NEXT_PUBLIC_SUPPORT_EMAIL and
 * NEXT_PUBLIC_SUPPORT_WHATSAPP. Either contact may be unset; the Help
 * screen then leaves that channel out.
 */
export function productName(): string {
  return process.env.NEXT_PUBLIC_PRODUCT_NAME ?? 'CBT Platform';
}

export interface SupportContacts {
  email?: string;
  /** Display form, as configured (for example "+234 801 234 5678"). */
  whatsapp?: string;
  /** https://wa.me/<digits>, derived from `whatsapp`. */
  whatsappHref?: string;
}

export function supportContacts(
  env: { email?: string | undefined; whatsapp?: string | undefined } = {
    email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
    whatsapp: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP,
  },
): SupportContacts {
  const contacts: SupportContacts = {};
  const email = env.email?.trim();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) contacts.email = email;
  const whatsapp = env.whatsapp?.trim();
  const digits = whatsapp?.replace(/\D/g, '') ?? '';
  // E.164 allows up to 15 digits; fewer than 8 cannot be a real number.
  if (whatsapp && digits.length >= 8 && digits.length <= 15) {
    contacts.whatsapp = whatsapp;
    contacts.whatsappHref = `https://wa.me/${digits}`;
  }
  return contacts;
}
