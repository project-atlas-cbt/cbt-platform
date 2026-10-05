// PROJECT.md: the product name is never hardcoded; it comes from PRODUCT_NAME.
// Shared by the root, apps/web and apps/marketing ESLint configs, so every
// workspace rejects the old codename and the current commercial name alike.
//
// The name is matched as a word, not as part of a domain or file name
// (`examkeep.com`, `/brand/examkeep-horizontal-colour.svg` stay legal: the
// drawn logo files are named for the brand they contain). Test files are
// exempt: they set PRODUCT_NAME to the real name to prove what users see.
//
// The names are assembled from pieces so this file's own strings don't trip
// the rule they define.
const OLD_CODENAME = ['project', 'atlas'].join(' ');
const NAME_NOW = ['exam', 'keep'].join('');
const NAME = `/${OLD_CODENAME}|\\b${NAME_NOW}\\b(?![.-])/i`;
const message =
  'Do not hardcode the product name. Read it from PRODUCT_NAME (NEXT_PUBLIC_PRODUCT_NAME in the browser), per PROJECT.md.';

export const productNameSelectors = [
  {
    selector: `Literal[value=${NAME}]:not(:matches(TSImportEqualsDeclaration, ImportDeclaration))`,
    message,
  },
  { selector: `TemplateElement[value.cooked=${NAME}]`, message },
  { selector: `JSXText[value=${NAME}]`, message },
];

export const productNameTestFiles = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.test.mjs',
  '**/*.spec.ts',
  '**/e2e/**',
  '**/test-support/**',
];
