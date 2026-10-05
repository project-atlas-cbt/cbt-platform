export { envSchema, loadEnv, EnvValidationError, type Env } from './env.schema.js';
export { getProductName } from './product.js';
export { loadRootEnv } from './load-root-env.js';
export { redisConnectionFromUrl, type RedisConnectionOptions } from './redis-connection.js';
export { composeConnectionUrls } from './connection-urls.js';
export {
  PLATFORM_SETTING_DEFINITIONS,
  PLATFORM_SETTING_KEYS,
  bareAddress,
  formatSender,
  isPlatformSettingKey,
  parseEmailList,
  platformSettingDefaults,
  platformSettingDefinition,
  resolvePlatformSettings,
  validatePlatformSetting,
  type DurationUnit,
  type PlatformSettingDefinition,
  type PlatformSettingKey,
  type PlatformSettingKind,
  type PlatformSettings,
  type PlatformSettingsEnv,
  type ResolvedPlatformSettings,
  type SettingValidation,
} from './platform-settings.js';
