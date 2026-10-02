/** DI tokens for NotificationsModule — in their own file so providers that
 * live inside the module (B20's OperationalAlertService) can import them
 * without an import cycle through notifications.module.ts. */
export const NOTIFICATION_CHANNEL = Symbol('NOTIFICATION_CHANNEL');
export const NOTIFICATION_TEMPLATE_REGISTRY = Symbol('NOTIFICATION_TEMPLATE_REGISTRY');
