import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { envSchema, loadRootEnv, type Env } from '@atlas/config';

// pnpm/turbo run this app's scripts with apps/api as cwd, so we resolve
// and load the repo-root .env ourselves (see loadRootEnv) before
// @nestjs/config ever looks at process.env — then tell it not to also try
// its own .env discovery, which would look in the wrong directory.
loadRootEnv();

/**
 * Wires @nestjs/config through @atlas/config's zod schema, so boot fails
 * fast on missing/malformed config (B0 scope) with a single source of
 * truth for what "valid" means, shared with apps/worker.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: true, // loadRootEnv() above already populated process.env
      validate: (config) => envSchema.parse(config),
    }),
  ],
  exports: [ConfigModule],
})
export class AppConfigModule {}

export type AppConfigService = ConfigService<Env, true>;
