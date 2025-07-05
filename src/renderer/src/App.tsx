import React, { useState } from 'react'
import TopToolbar from './components/TopToolbar'
import LeftPanel from './components/LeftPanel'
import MainWorkArea from './components/MainWorkArea'
import './App.css'

function App(): React.JSX.Element {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [leftPanelTab, setLeftPanelTab] = useState<'explorer' | 'git' | 'settings'>('explorer')

  return (
    <div className="app">
      <TopToolbar />
      <div className="app-content">
        <LeftPanel 
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
