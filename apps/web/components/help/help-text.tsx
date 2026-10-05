import { Fragment, type ReactNode } from 'react';
import { productName } from '@/lib/help/config';

/**
 * Renders guide text (ADR-0035): `**…**` becomes <strong> (a control to find
 * on screen) and `{product}` becomes the configured product name. Built from
 * string splits into React nodes, never HTML, so guide text cannot inject
 * markup under the nonce CSP.
 */
export function HelpText({ text }: { text: string }): ReactNode {
  const resolved = text.replaceAll('{product}', productName());
  const parts = resolved.split('**');
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <strong key={index} className="font-semibold text-text-primary">
        {part}
      </strong>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

/** Plain-text form of guide text, for titles and aria labels. */
export function helpPlainText(text: string): string {
  return text.replaceAll('{product}', productName()).replaceAll('**', '');
}
