import { contextBridge, ipcRenderer } from 'electron';
import { DESKTOP_CHANNELS as channels } from './desktop-contracts.ts';
import type { DesktopApi } from './desktop-contracts.ts';

const api: DesktopApi = {
  status: () => ipcRenderer.invoke(channels.status),
  search: (query, includePublicText, mode) => ipcRenderer.invoke(channels.search,
    includePublicText === undefined && mode === undefined ? query
      : { query, includePublicText: includePublicText ?? false, ...(mode === undefined ? {} : { mode }) }),
  read: (reference, lineStart) => ipcRenderer.invoke(channels.read,
    lineStart === undefined ? reference : { reference, lineStart }),
  startCapture: reference => ipcRenderer.invoke(channels.startCapture, reference),
  captureStatus: id => ipcRenderer.invoke(channels.captureStatus, id),
  cancelCapture: id => ipcRenderer.invoke(channels.cancelCapture, id),
  discoverChromeProfiles: () => ipcRenderer.invoke(channels.discoverProfiles),
  openChromeProfile: profileId => ipcRenderer.invoke(channels.openProfile, profileId),
  beginPairing: profileId => ipcRenderer.invoke(channels.beginPairing, profileId),
  cancelPairing: () => ipcRenderer.invoke(channels.cancelPairing),
  setSourceEnabled: (sourceId, enabled) => ipcRenderer.invoke(channels.setSourceEnabled, sourceId, enabled),
  disconnectSource: sourceId => ipcRenderer.invoke(channels.disconnectSource, sourceId),
  listGrants: afterId => ipcRenderer.invoke(channels.listGrants, afterId === undefined ? undefined : { afterId }),
  revokeGrant: grantId => ipcRenderer.invoke(channels.revokeGrant, grantId),
  setDoubleShiftEnabled: enabled => ipcRenderer.invoke(channels.setDoubleShiftEnabled, enabled),
  open: reference => ipcRenderer.invoke(channels.open, reference),
  copy: reference => ipcRenderer.invoke(channels.copy, reference),
  hide: () => ipcRenderer.invoke(channels.hide),
  setLayout: layout => ipcRenderer.invoke(channels.setLayout, layout),
  onFocus: listener => {
    const callback = (): void => listener();
    ipcRenderer.on(channels.focus, callback);
    return () => { ipcRenderer.removeListener(channels.focus, callback); };
  },
};

contextBridge.exposeInMainWorld('anysearch', api);
