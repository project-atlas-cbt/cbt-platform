export type { NotificationChannel, NotificationMessage } from './channel.js';
export {
  TemplateRegistry,
  interpolate,
  UnknownTemplateError,
  MissingTemplateVariableError,
  InvalidAttachmentError,
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_TEMPLATE,
  type TemplateAttachment,
  type TemplateDefinition,
  type RenderedTemplate,
} from './template.js';
export { ConsoleNotificationChannel, type ConsoleChannelOptions } from './console-channel.js';
export {
  NOTIFICATION_DISPATCH_QUEUE_NAME,
  type NotificationDispatchJobPayload,
} from './dispatch-queue.js';
export {
  OPERATIONAL_ALERT_TEMPLATE,
  operationalAlertVariables,
  parseOpsAlertRecipients,
  type OperationalAlert,
} from './operational-alert.js';
