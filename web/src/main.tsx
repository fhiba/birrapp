import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import App from './App'
import { watchForUpdates } from './registerSW'

watchForUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
