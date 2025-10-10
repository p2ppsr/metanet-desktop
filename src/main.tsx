// src/main.tsx
import './profileShim'               // must be first
import './bridgePresenceAnnouncer'
import './fetchProxy'
import './slapLookupProbe'
import './filterDomNestingWarning'   // <-- ensure this is before React renders
import './forceNoPForTypography'     // runtime safety net
import { startHttpBridge } from './bridge/httpBridge'

import React from 'react'
import { createRoot } from 'react-dom/client'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { UserInterface } from '@bsv/brc100-ui-react-components'
import { onWalletReady } from './onWalletReady'
import ErrorBoundary from './ErrorBoundary'
import { tauriFunctions } from './tauriFunctions'
import packageJson from '../package.json'
import { createTheme, ThemeProvider } from '@mui/material/styles'

// Start the Tauri<->renderer HTTP bridge ASAP, but only once (Vite HMR safe)
declare global {
  interface Window { __mndHttpBridgeStarted?: boolean }
}
if (typeof window !== 'undefined' && !window.__mndHttpBridgeStarted) {
  window.__mndHttpBridgeStarted = true
  try {
    startHttpBridge()
    console.info('[MND] http bridge started')
  } catch (e) {
    console.warn('[MND] failed to start http bridge:', e)
  }
}

/**
 * We avoid setting MuiTypography.defaultProps.component = 'span' directly
 * to keep TS happy with MUI’s ListItemText generics. Instead we:
 *  - turn off paragraph rendering,
 *  - map all variants to 'span',
 *  - and set ListItemText Typography props to 'span'.
 */
const theme = createTheme({
  components: {
    MuiTypography: {
      defaultProps: {
        paragraph: false,
        variantMapping: {
          h1: 'span',
          h2: 'span',
          h3: 'span',
          h4: 'span',
          h5: 'span',
          h6: 'span',
          subtitle1: 'span',
          subtitle2: 'span',
          body1: 'span',
          body2: 'span',
          inherit: 'span',
          overline: 'span',
          button: 'span',
          caption: 'span',
        },
      } as any,
    },
    MuiListItemText: {
      defaultProps: {
        primaryTypographyProps:  { component: 'span', paragraph: false } as any,
        secondaryTypographyProps:{ component: 'span', paragraph: false } as any,
      },
    },
  },
  templates: { page_wrap: {} },
})

const rootElement = document.getElementById('root')
if (rootElement) {
  const root = createRoot(rootElement)
  root.render(
    <React.StrictMode>
      <ThemeProvider theme={theme}>
        <ErrorBoundary>
          <UserInterface
            onWalletReady={onWalletReady}
            nativeHandlers={tauriFunctions}
            appVersion={packageJson.version}
            appName="BSV Desktop"
          />
        </ErrorBoundary>
        <ToastContainer
          position="top-right"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="light"
        />
      </ThemeProvider>
    </React.StrictMode>
  )
}
