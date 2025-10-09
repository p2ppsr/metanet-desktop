import React from 'react'
import { UserInterface } from '@bsv/brc100-ui-react-components'
import { onWalletReady } from './onWalletReady'
import ErrorBoundary from './ErrorBoundary'
import { tauriFunctions } from './tauriFunctions'
import packageJson from '../package.json'

export default function ReadyUI() {
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    let t = setInterval(() => {
      try {
        // library stores profile in localStorage; guard until it’s created
        const raw = localStorage.getItem('activeProfile')
        if (raw) setReady(true)
      } catch {}
    }, 50)
    return () => clearInterval(t)
  }, [])

  if (!ready) return null // or a minimal skeleton

  return (
    <ErrorBoundary>
      <UserInterface
        onWalletReady={onWalletReady}
        nativeHandlers={tauriFunctions}
        appVersion={packageJson.version}
        appName="BSV Desktop"
      />
    </ErrorBoundary>
  )
}
