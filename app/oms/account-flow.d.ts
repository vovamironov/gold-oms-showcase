export type AccountOutcome = 'opened' | 'existing' | 'non-client' | 'opening-error';
export type AccountResultScreen = { title: string; action: string; href: string };
export type AccountFlow = {
  open(activation?: { currentTarget: HTMLElement; detail: number }): void;
  openResult(): void;
  close(): void;
  destroy(): void;
};
export const ACCOUNT_DESTINATIONS: Readonly<Record<'opened' | 'existing' | 'non-client', string>>;
export const ACCOUNT_RESEND_SECONDS: number;
export function normalizeAccountPhone(value: unknown): string | null;
export function formatAccountPhone(value: string): string;
export function createAccountFlow(options: {
  dialog: HTMLDialogElement;
  trigger?: HTMLElement;
  preview?: HTMLElement;
  outcome?: AccountOutcome | { value: string };
  phoneTitle?: string;
  window?: Window;
  navigate?: (url: string) => void;
  onOpenChange?: (open: boolean) => void;
  onVerified?: () => void;
  resultScreen?: AccountResultScreen;
}): AccountFlow;
