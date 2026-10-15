export const GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_MODIFY = "https://www.googleapis.com/auth/gmail.modify";
export const GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";

export function googleScopes(write: boolean): string[] {
  return write ? [GMAIL_READONLY, GMAIL_MODIFY, GMAIL_SEND] : [GMAIL_READONLY];
}

export function scopeLabel(scopes: string): string {
  if (scopes.includes("gmail.modify") || scopes.includes("gmail.compose")) {
    return "Read and drafts";
  }
  if (scopes.includes("gmail.send")) return "Read and send";
  return "Read only";
}

export function canCreateDraft(scopes: string): boolean {
  return scopes.includes("gmail.modify") || scopes.includes("gmail.compose");
}
