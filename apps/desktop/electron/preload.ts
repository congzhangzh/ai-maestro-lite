import { contextBridge, ipcRenderer } from "electron";
import type {
  ActionRunRequest,
  ApplyVsCodeProxyInput,
  DesktopContext,
  SaveClaudeSettingsInput,
  UrlAuditEvent
} from "@ai-maestro-lite/shared";
import type { BrowserPolicy, DesktopSettings } from "@ai-maestro-lite/shared";

contextBridge.exposeInMainWorld("aiMaestro", {
  getDesktopContext: () => ipcRenderer.invoke("desktop:getContext") as Promise<DesktopContext>,
  getDesktopSettings: () => ipcRenderer.invoke("desktop:getSettings") as Promise<DesktopSettings>,
  saveEmployeeId: (employeeId: string) => ipcRenderer.invoke("desktop:saveEmployeeId", employeeId) as Promise<DesktopSettings>,
  saveClaudeSettings: (payload: SaveClaudeSettingsInput) =>
    ipcRenderer.invoke("claude:saveSettings", payload) as Promise<DesktopSettings>,
  applyVsCodeProxyTemplate: (payload: ApplyVsCodeProxyInput) =>
    ipcRenderer.invoke("vscode:applyProxyTemplate", payload) as Promise<DesktopSettings>,
  resetVsCodeProxyTemplate: () => ipcRenderer.invoke("vscode:resetProxyTemplate") as Promise<DesktopSettings>,
  runSceneAction: (payload: ActionRunRequest) => ipcRenderer.invoke("scene:runAction", payload),
  getBrowserPolicy: () => ipcRenderer.invoke("browser:getPolicy") as Promise<BrowserPolicy>,
  getRecentAudits: () => ipcRenderer.invoke("browser:getRecentAudits") as Promise<UrlAuditEvent[]>
});
