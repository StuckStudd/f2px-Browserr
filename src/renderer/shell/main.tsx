import { createRoot } from 'react-dom/client'
import '../styles/fonts.css'
import '../styles/tokens.css'
import '../styles/base.css'
import '../styles/components.css'
import './shell.css'
import { ShellApp } from './ShellApp'

createRoot(document.getElementById('root') as HTMLElement).render(<ShellApp />)
