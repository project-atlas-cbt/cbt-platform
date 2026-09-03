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
export {
  NOTIFICATION_DISPATCH_QUEUE_NAME,
  type NotificationDispatchJobPayload,
} from './dispatch-queue.js';
