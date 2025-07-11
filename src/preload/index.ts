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
    fetchUpstream: (projectPath: string) => ipcRenderer.invoke('config:fetch-upstream', projectPath),
    checkoutBranch: (projectPath: string, branch: string) => ipcRenderer.invoke('config:checkout-branch', projectPath, branch),
    // 上游远程管理
    hasUpstreamRemote: (projectPath: string) => ipcRenderer.invoke('config:has-upstream-remote', projectPath),
    addUpstreamRemote: (projectPath: string, upstreamUrl: string) => ipcRenderer.invoke('config:add-upstream-remote', projectPath, upstreamUrl),
    getUpstreamUrl: (projectPath: string) => ipcRenderer.invoke('config:get-upstream-url', projectPath),
    validateUpstreamRemote: (projectPath: string) => ipcRenderer.invoke('config:validate-upstream-remote', projectPath),
    removeUpstreamRemote: (projectPath: string) => ipcRenderer.invoke('config:remove-upstream-remote', projectPath)
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
      ipcRenderer.invoke('files:save-file-content', projectPath, filePath, content),
    translateFile: (projectPath: string, filePath: string, upstreamBranch: string, workingBranch: string) => 
      ipcRenderer.invoke('files:translate-file', projectPath, filePath, upstreamBranch, workingBranch),
    clearProjectCache: (projectPath: string) => 
      ipcRenderer.invoke('files:clear-project-cache', projectPath),
    clearBranchCache: (projectPath: string, workingBranch: string, upstreamBranch: string) => 
      ipcRenderer.invoke('files:clear-branch-cache', projectPath, workingBranch, upstreamBranch)
  },
  git: {
    getStatus: (projectPath: string) => ipcRenderer.invoke('git:get-status', projectPath),
    stageFile: (projectPath: string, filePath: string) => ipcRenderer.invoke('git:stage-file', projectPath, filePath),
    stageAll: (projectPath: string) => ipcRenderer.invoke('git:stage-all', projectPath),
    unstageFile: (projectPath: string, filePath: string) => ipcRenderer.invoke('git:unstage-file', projectPath, filePath),
    commit: (projectPath: string, message: string) => ipcRenderer.invoke('git:commit', projectPath, message),
    push: (projectPath: string, remote?: string, branch?: string) => ipcRenderer.invoke('git:push', projectPath, remote, branch),
    commitAndPush: (projectPath: string, message: string, remote?: string, branch?: string) => ipcRenderer.invoke('git:commit-and-push', projectPath, message, remote, branch),
    getCommitHistory: (projectPath: string, limit?: number) => ipcRenderer.invoke('git:get-commit-history', projectPath, limit),
    getCurrentBranch: (projectPath: string) => ipcRenderer.invoke('git:get-current-branch', projectPath),
    hasUncommittedChanges: (projectPath: string) => ipcRenderer.invoke('git:has-uncommitted-changes', projectPath),
    getRemoteUrl: (projectPath: string, remote?: string) => ipcRenderer.invoke('git:get-remote-url', projectPath, remote)
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