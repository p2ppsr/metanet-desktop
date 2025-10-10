// src/forceNoPForTypography.ts
// Ensure this file is a module so `declare global` is allowed.
export {}

declare global {
  interface Window {
    __mndTypographyPatcherActive?: boolean
  }
}

import * as ReactNS from 'react'

;(function activatePatch() {
  const w = window as Window

  if (w.__mndTypographyPatcherActive) return
  w.__mndTypographyPatcherActive = true

  const React: any = ReactNS as any
  const origCreateElement = React.createElement
  let inPatch = false

  function isTypographyType(t: any): boolean {
    // Base or styled(MuiTypography)
    return t?.muiName === 'Typography' || t?.render?.muiName === 'Typography'
  }

  function coercePropsToSpan<P extends Record<string, any>>(p: P | null | undefined): P {
    if (!p) return p as P
    const next: any = { ...p }
    if (next.component === 'p') next.component = 'span'
    if (next.paragraph) next.paragraph = false
    return next
  }

  function coerceElementToSpan(el: any) {
    if (!el || typeof el !== 'object') return el
    // If the resolved host element is <p> coming from Typography, flip it.
    if (
      el.type === 'p' &&
      typeof el.props?.className === 'string' &&
      el.props.className.includes('MuiTypography-root')
    ) {
      return {
        ...el,
        type: 'span',
        props: {
          ...el.props,
          component: 'span',
          paragraph: false,
        },
      }
    }
    return el
  }

  // Patch createElement (cast to any to avoid "read-only" TS complaints on the type)
  ;(React as any).createElement = function patchedCreateElement(type: any, props?: any, ...children: any[]) {
    if (inPatch) return origCreateElement(type, props, ...children)
    inPatch = true
    try {
      const isTypo = isTypographyType(type)
      const safeProps = isTypo ? coercePropsToSpan(props) : props
      const created = origCreateElement(type, safeProps, ...children)
      return coerceElementToSpan(created)
    } finally {
      inPatch = false
    }
  }

  console.info('[MND] Typography <p> → <span> patch active')
})()
