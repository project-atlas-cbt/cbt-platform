export type { NotificationChannel, NotificationMessage } from './channel.js';
export {
  TemplateRegistry,
  interpolate,
  UnknownTemplateError,
  MissingTemplateVariableError,
  type TemplateDefinition,
  type RenderedTemplate,
} from './template.js';
export { ConsoleNotificationChannel } from './console-channel.js';
