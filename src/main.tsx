import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import { GameProvider } from './persistence/store'

createRoot(document.getElementById('root')!).render(
  <StrictMode><GameProvider><App /></GameProvider></StrictMode>,
)
