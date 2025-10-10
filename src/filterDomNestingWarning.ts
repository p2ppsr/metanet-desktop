// src/filterDomNestingWarning.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

const origError = console.error
console.error = function (...args: any[]) {
  const msg = String(args[0] ?? '')
  if (
    msg.includes('validateDOMNesting') &&
    msg.includes('<div> cannot appear as a descendant of <p>')
  ) {
    return // drop it
  }
  origError.apply(console, args as any)
}
console.info('[MND] validateDOMNesting <div-in-<p> warning silenced')

// Mark this file as a module so TS is happy when importing it.
export {}
