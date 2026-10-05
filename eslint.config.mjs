// Root ESLint flat config shared by every app and package.
// AGENTS.md / CLAUDE.md: TypeScript strict mode is a project-wide baseline (B0 scope).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import { productNameSelectors, productNameTestFiles } from './scripts/eslint-product-name.mjs';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/cdk.out/**',
      '**/generated/**',
      '**/*.generated.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Config/tooling files that deliberately sit outside a package's
        // "include" (so its build's rootDir/outDir stays clean — see e.g.
        // packages/domain and packages/contracts, whose dist/ is a real
        // published "main") still get type-aware linting via a one-off
        // default program, rather than needing every such file added to
        // the package's own tsconfig.
        // `**` isn't allowed in these globs (typescript-eslint restriction),
        // so each nesting level is spelled out explicitly rather than
        // matched with a single recursive pattern.
        projectService: {
          allowDefaultProject: [
            'apps/*/vitest.config.ts',
            'apps/*/vitest.integration.config.ts',
            'apps/*/vitest.security.config.ts',
            'packages/*/vitest.config.ts',
            'packages/*/prisma.config.ts',
            'packages/*/prisma/seed.ts',
            'packages/*/prisma/migrate-deploy.ts',
            // Root-level tooling: `turbo run lint` only invokes each
            // workspace package's own scoped `lint` script, so these
            // repo-root files are never linted that way — only by
            // lint-staged's pre-commit hook, which runs eslint directly
            // against whatever's staged, root files included.
            'eslint.config.mjs',
            'scripts/*.mjs',
            // B21 load-harness helpers run as plain Node ESM (a --import
            // preload and a container relay), outside the package's TS build.
            'tools/*/scripts/*.mjs',
            'tools/*/netem/*.mjs',
          ],
          // Without this, the ad-hoc "default project" typescript-eslint
          // builds for the files above has no module/moduleResolution
          // setting, falls back to classic resolution, and can't resolve
          // @eslint/js's and typescript-eslint's own type declarations —
          // every import from them then types as `any` and cascades into
          // spurious no-unsafe-* errors. Pointing it at the same base
          // config every real package extends fixes resolution instead of
          // suppressing the resulting errors.
          defaultProject: 'tsconfig.base.json',
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Product name must come from environment, never be hardcoded (PROJECT.md).
      'no-restricted-syntax': ['error', ...productNameSelectors],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Tests set PRODUCT_NAME to the real name to prove what users see.
    files: productNameTestFiles,
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['eslint.config.mjs', 'scripts/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  eslintConfigPrettier,
);
