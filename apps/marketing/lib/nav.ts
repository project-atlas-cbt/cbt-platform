export const primaryNav = [
  { href: '/features', label: 'Features' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/exam-day-reliability', label: 'Exam-day reliability' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/faq', label: 'FAQ' },
] as const;

export const footerNav = [
  {
    heading: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/how-it-works', label: 'How it works' },
      { href: '/exam-day-reliability', label: 'Exam-day reliability' },
      { href: '/security', label: 'Security and data' },
      { href: '/pricing', label: 'Pricing' },
    ],
  },
  {
    heading: 'For schools',
    links: [
      { href: '/request-a-demo', label: 'Request a demo' },
      { href: '/get-started', label: 'Get your school ready' },
      { href: '/find-your-school', label: 'Find your school' },
      { href: '/faq', label: 'FAQ' },
      { href: '/guides', label: 'Guides' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
  },
] as const;
