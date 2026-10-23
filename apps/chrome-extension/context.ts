export const DEFAULT_PROFILE_LABEL = '当前 Chrome 配置';

interface ExtensionSender {
  id?: string;
  url?: string;
  incognito?: boolean;
  tab?: { incognito?: boolean };
}

export function isOrdinaryContext(inIncognitoContext: unknown, sender?: ExtensionSender): boolean {
  return inIncognitoContext !== true && sender?.incognito !== true && sender?.tab?.incognito !== true;
}

export function isTrustedPopup(sender: ExtensionSender, extensionId: string, popupUrl: string): boolean {
  return sender.id === extensionId && sender.url === popupUrl;
}

export function profileLabel(value?: string, selectedName?: string): string {
  return value?.trim() || selectedName?.trim() || DEFAULT_PROFILE_LABEL;
}
