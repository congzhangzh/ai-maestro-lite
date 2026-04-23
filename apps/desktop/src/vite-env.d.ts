/// <reference types="vite/client" />

import type {
  ActionRunRequest,
  ActionRunResult,
  ApplyVsCodeProxyInput,
  BrowserPolicy,
  DesktopContext,
  DesktopSettings,
  SaveClaudeSettingsInput,
  UrlAuditEvent
} from "@ai-maestro-lite/shared";

declare global {
  interface Window {
    aiMaestro: {
      getDesktopContext: () => Promise<DesktopContext>;
      getDesktopSettings: () => Promise<DesktopSettings>;
      saveEmployeeId: (employeeId: string) => Promise<DesktopSettings>;
      saveClaudeSettings: (payload: SaveClaudeSettingsInput) => Promise<DesktopSettings>;
      applyVsCodeProxyTemplate: (payload: ApplyVsCodeProxyInput) => Promise<DesktopSettings>;
      resetVsCodeProxyTemplate: () => Promise<DesktopSettings>;
      runSceneAction: (payload: ActionRunRequest) => Promise<ActionRunResult>;
      getBrowserPolicy: () => Promise<BrowserPolicy>;
      getRecentAudits: () => Promise<UrlAuditEvent[]>;
    };
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        partition?: string;
        allowpopups?: boolean;
      };
    }
  }
}

export {};
