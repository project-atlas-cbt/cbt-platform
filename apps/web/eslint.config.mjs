// eslint-config-next's FlatCompat shim crashes (circular JSON) against
// this project's ESLint 10 + typescript-eslint 8 combination — a known
// friction point translating Next's legacy eslintrc config into flat
// config. Rather than fight that, B0 lints apps/web the same way as every
// other workspace (typescript-eslint) plus react-hooks, and leaves
// Next-specific rules (next/core-web-vitals, next/typescript) to F0, which
// builds the real app and can revisit this once eslint-config-next ships a
// native flat config or the incompatibility is resolved upstream.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import { productNameSelectors, productNameTestFiles } from '../../scripts/eslint-product-name.mjs';

export default tseslint.config(
  {
    // Unlike every other workspace, this config file lives inside the tree
    // `eslint .` lints (apps/web), so it must exclude itself — the
    // type-aware parserOptions.projectService below has no tsconfig
    // covering a .mjs file. postcss.config.mjs (F0, Tailwind v4's PostCSS
    // plugin entry point) is the same situation.
    ignores: [
      '.next/**',
      'node_modules/**',
      'eslint.config.mjs',
      'postcss.config.mjs',
      'public/**',
      // F20: plain-Node build checks (bundle budget) — same no-tsconfig
      // situation as the two .mjs configs above.
      'scripts/*.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Product name must come from environment, never be hardcoded (PROJECT.md).
      'no-restricted-syntax': ['error', ...productNameSelectors],
    },
  },
  {
    // Tests set PRODUCT_NAME to the real name to prove what users see.
    files: productNameTestFiles,
    rules: { 'no-restricted-syntax': 'off' },
  },
  eslintConfigPrettier,
);
