/**
 * Emits apps/api/openapi.json from the Nest application definition without
 * starting an HTTP listener — a NestFactory "application context" boot is
 * enough to build the Swagger document. Run via `pnpm openapi:emit`; the
 * result is committed and @atlas/contracts generates types from it.
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
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await app.init();

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
