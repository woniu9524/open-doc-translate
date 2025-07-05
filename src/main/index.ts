import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { ConfigManager } from './config'
import { FileManager } from './fileManager'

let configManager: ConfigManager
let fileManager: FileManager

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // 初始化配置管理器
  configManager = new ConfigManager()
  await configManager.loadConfig()

  // 初始化文件管理器
  fileManager = new FileManager()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC handlers for config management
  ipcMain.handle('config:load', async () => {
    return configManager.getConfig()
  })

  ipcMain.handle('config:save', async (_, config) => {
    await configManager.saveConfig(config)
    return true
  })

  ipcMain.handle('config:add-project', async () => {
    return await configManager.addProject()
  })

  ipcMain.handle('config:update-project', async (_, projectPath, updates) => {
    await configManager.updateProject(projectPath, updates)
    return true
  })

  ipcMain.handle('config:remove-project', async (_, projectPath) => {
    await configManager.removeProject(projectPath)
    return true
  })

  ipcMain.handle('config:set-active-project', async (_, projectPath) => {
    await configManager.setActiveProject(projectPath)
    return true
  })

  ipcMain.handle('config:get-active-project', async () => {
    return configManager.getActiveProject()
  })

  ipcMain.handle('config:get-branches', async (_, projectPath) => {
    return await configManager.getBranches(projectPath)
  })

  ipcMain.handle('config:fetch-upstream', async (_, projectPath) => {
    await configManager.fetchUpstream(projectPath)
    return true
  })

  // IPC handlers for file management
  ipcMain.handle('files:get-file-tree', async (_, projectPath, watchDirectories, fileTypes, upstreamBranch, workingBranch) => {
    return await fileManager.getFileTree(projectPath, watchDirectories, fileTypes, upstreamBranch, workingBranch)
  })

  ipcMain.handle('files:get-file-status', async (_, projectPath, filePath, upstreamBranch, workingBranch) => {
    return await fileManager.getFileStatus(projectPath, filePath, upstreamBranch, workingBranch)
  })

  ipcMain.handle('files:sync-file-statuses', async (_, projectPath, watchDirectories, fileTypes, upstreamBranch, workingBranch) => {
    await fileManager.syncFileStatuses(projectPath, watchDirectories, fileTypes, upstreamBranch, workingBranch)
    return true
  })

  ipcMain.handle('files:get-file-content', async (_, projectPath, filePath, upstreamBranch, workingBranch) => {
    return await fileManager.getFileContent(projectPath, filePath, upstreamBranch, workingBranch)
  })

  ipcMain.handle('files:save-file-content', async (_, projectPath, filePath, content) => {
    await fileManager.saveFileContent(projectPath, filePath, content)
    return true
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
