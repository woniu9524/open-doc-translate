import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  config: {
    load: () => ipcRenderer.invoke('config:load'),
    save: (config: any) => ipcRenderer.invoke('config:save', config),
    addProject: () => ipcRenderer.invoke('config:add-project'),
    updateProject: (projectPath: string, updates: any) => 
      ipcRenderer.invoke('config:update-project', projectPath, updates),
    removeProject: (projectPath: string) => 
      ipcRenderer.invoke('config:remove-project', projectPath),
    setActiveProject: (projectPath: string) => 
      ipcRenderer.invoke('config:set-active-project', projectPath),
    getActiveProject: () => ipcRenderer.invoke('config:get-active-project'),
    getBranches: (projectPath: string) => ipcRenderer.invoke('config:get-branches', projectPath),
    fetchUpstream: (projectPath: string) => ipcRenderer.invoke('config:fetch-upstream', projectPath)
  },
  files: {
    getFileTree: (projectPath: string, watchDirectories: string[], fileTypes: string[], upstreamBranch: string, workingBranch: string) => 
      ipcRenderer.invoke('files:get-file-tree', projectPath, watchDirectories, fileTypes, upstreamBranch, workingBranch),
    getFileStatus: (projectPath: string, filePath: string, upstreamBranch: string, workingBranch: string) => 
      ipcRenderer.invoke('files:get-file-status', projectPath, filePath, upstreamBranch, workingBranch),
    syncFileStatuses: (projectPath: string, watchDirectories: string[], fileTypes: string[], upstreamBranch: string, workingBranch: string) => 
      ipcRenderer.invoke('files:sync-file-statuses', projectPath, watchDirectories, fileTypes, upstreamBranch, workingBranch),
    getFileContent: (projectPath: string, filePath: string, upstreamBranch: string, workingBranch: string) => 
      ipcRenderer.invoke('files:get-file-content', projectPath, filePath, upstreamBranch, workingBranch),
    saveFileContent: (projectPath: string, filePath: string, content: string) => 
      ipcRenderer.invoke('files:save-file-content', projectPath, filePath, content)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
