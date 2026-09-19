/**
 * Emits apps/api/openapi.json from the Nest application definition without
 * starting an HTTP listener — a NestFactory "application context" boot is
 * enough to build the Swagger document. Run via `pnpm openapi:emit`; the
 * result is committed and @atlas/contracts generates types from it.
 *
 * The `openapi:emit` script runs this file compiled (`nest build && node
 * dist/openapi/emit.js`), not live via `tsx`, as every other standalone
 * script in this package does (spike/run-spike.ts). B1 found a genuine tsx
 * bug: `tsx`'s esbuild-based transform crashes `NestFactory.create(AppModule)`
 * with no error output (not a catchable exception — the process just exits
 * 1) specifically once `IdentityService` is registered, while the exact
 * same boot succeeds correctly under Vitest's transform (every integration
 * test proves this) *and* under plain `node` against the compiled output.
 * Since CI's contract-drift job already builds apps/api immediately before
 * calling this script (.github/workflows/ci.yml), building here too costs
 * nothing there and fixes local `pnpm generate` the same way.
 */
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { getProductName, type Env } from '@atlas/config';
import { AppModule } from '../app.module.js';
import { buildOpenApiConfig } from './document.js';
import { ErrorEnvelopeDto } from '../common/error-envelope.dto.js';
import { injectSharedComponents } from './shared-components.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  // OpenAPI generation builds an application context only; it must never
  // claim background jobs or establish queue consumers as a side effect.
  process.env.ATLAS_OPENAPI_EMIT = 'true';
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  const config = app.get(ConfigService<Env, true>);
  const productName = getProductName({ PRODUCT_NAME: config.get('PRODUCT_NAME', { infer: true }) });
  const document = SwaggerModule.createDocument(app, buildOpenApiConfig(productName), {
    extraModels: [ErrorEnvelopeDto],
  });
  injectSharedComponents(document);
  const outPath = resolve(__dirname, '../../openapi.json');
  writeFileSync(outPath, JSON.stringify(document, null, 2) + '\n', 'utf-8');
  console.log(`[openapi] wrote ${outPath}`);

  await app.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('[openapi] failed:', err);
  process.exit(1);
});
