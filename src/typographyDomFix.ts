// src/typographyDomFix.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

const FIX_CLASS = 'MuiTypography-root'

function swapPtoSpan(p: HTMLParagraphElement) {
  try {
    // Already handled?
    if (!p || p.tagName !== 'P') return
    const span = document.createElement('span')

    // Copy attributes
    for (const attr of Array.from(p.attributes)) {
      span.setAttribute(attr.name, attr.value)
    }

    // Move children
    while (p.firstChild) span.appendChild(p.firstChild)

    // Replace in DOM
    p.replaceWith(span)
  } catch (e) {
    // Non-fatal
    console.warn('[MND] Typography DOM swap failed:', e)
  }
}

function fixAll(root: ParentNode = document) {
  const candidates = root.querySelectorAll<HTMLParagraphElement>(`p.${FIX_CLASS}`)
  candidates.forEach(swapPtoSpan)
}

function installObserver() {
  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      // Fix newly-added subtrees
      m.addedNodes.forEach((n) => {
        if (n.nodeType === Node.ELEMENT_NODE) {
          const el = n as Element
          if (el instanceof HTMLParagraphElement && el.classList.contains(FIX_CLASS)) {
            swapPtoSpan(el)
          } else {
            // Scan its subtree
            fixAll(el)
          }
        }
      })
      // If attributes changed on an existing <p>, re-check it
      if (m.type === 'attributes' && m.target instanceof HTMLParagraphElement) {
        const p = m.target as HTMLParagraphElement
        if (p.classList.contains(FIX_CLASS)) swapPtoSpan(p)
      }
    }
  })

  obs.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  })
}

// Run ASAP
try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      fixAll()
      installObserver()
    }, { once: true })
  } else {
    fixAll()
    installObserver()
  }
  console.info('[MND] Typography DOM fix active (p ➜ span)')
} catch (e) {
  console.warn('[MND] Unable to install Typography DOM fix:', e)
}
