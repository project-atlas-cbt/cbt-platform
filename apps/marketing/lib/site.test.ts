import { describe, expect, it } from 'vitest';
import { securityHeaders } from './security-headers';
import { formatNaira, readSiteConfig, whatsappLink } from './site';

describe('readSiteConfig', () => {
  it('takes the name and domain from the environment', () => {
    const config = readSiteConfig({
      PRODUCT_NAME: 'ExamKeep',
      PLATFORM_ROOT_DOMAIN: 'examkeep.com',
    });
    expect(config).toMatchObject({
      name: 'ExamKeep',
      rootDomain: 'examkeep.com',
      url: 'https://examkeep.com',
    });
  });

  it('leaves unset contact details and price out rather than inventing them', () => {
    const config = readSiteConfig({
      PRODUCT_NAME: 'ExamKeep',
      MARKETING_PRICE_FROM_NGN: 'abc',
      MARKETING_WHATSAPP: ' ',
    });
    expect(config.priceFromNgn).toBeUndefined();
    expect(config.whatsapp).toBeUndefined();
    expect(whatsappLink(config)).toBeUndefined();
  });

  it('normalises a WhatsApp number to digits', () => {
    const config = readSiteConfig({ MARKETING_WHATSAPP: '+234 803 123 4567' });
    expect(whatsappLink(config, 'Hi')).toBe('https://wa.me/2348031234567?text=Hi');
  });
});

describe('formatNaira', () => {
  it('formats with the naira sign and grouping', () => {
    expect(formatNaira(1500)).toBe('₦1,500');
  });
});

describe('securityHeaders', () => {
  it('allows no third-party origins and forbids framing', () => {
    const csp = securityHeaders('examkeep.com').find(
      (h) => h.key === 'Content-Security-Policy',
    )!.value;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self' https://*.examkeep.com");
    expect(csp).not.toMatch(/https:\/\/(?!\*\.examkeep\.com)/);
  });
});
