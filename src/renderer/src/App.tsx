import React, { useState, useRef } from 'react'
import TopToolbar from './components/TopToolbar'
import LeftPanel from './components/LeftPanel'
import MainWorkArea from './components/MainWorkArea'
import './App.css'

function App(): React.JSX.Element {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [leftPanelTab, setLeftPanelTab] = useState<'explorer' | 'git' | 'settings'>('explorer')
  const leftPanelRef = useRef<{ refreshFiles: () => void } | null>(null)

  const handleFileTreeRefresh = () => {
    if (leftPanelRef.current) {
      leftPanelRef.current.refreshFiles()
    }
  }

  return (
    <div className="app">
      <TopToolbar onFileTreeRefresh={handleFileTreeRefresh} />
      <div className="app-content">
        <LeftPanel 
          ref={leftPanelRef}
          activeTab={leftPanelTab}
          onTabChange={setLeftPanelTab}
          selectedFiles={selectedFiles}
          onSelectedFilesChange={setSelectedFiles}
          onFileSelect={setActiveFile}
        />
        <MainWorkArea 
          activeFile={activeFile}
          onFileChange={setActiveFile}
        />
      </div>
    </div>
  )
}

export default App
