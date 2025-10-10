// src/paragraphFixer.ts
if (typeof window !== 'undefined') {
  const fix = (node: Element) => {
    if (node.tagName === 'P' && node.querySelector(':scope > div')) {
      const div = document.createElement('div');
      for (const attr of Array.from(node.attributes)) div.setAttribute(attr.name, attr.value);
      // mark so we don’t loop
      div.setAttribute('data-mnd-fixed', '1');
      while (node.firstChild) div.appendChild(node.firstChild);
      node.replaceWith(div);
    }
  };

  const scan = (root: ParentNode) => {
    root.querySelectorAll?.('p').forEach(fix);
  };

  const obs = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'childList') {
        m.addedNodes.forEach(n => {
          if (n instanceof Element) {
            if (n.tagName === 'P') fix(n);
            scan(n);
          }
        });
      } else if (m.type === 'attributes' && m.target instanceof Element && m.target.tagName === 'P') {
        fix(m.target);
      }
    }
  });

  window.addEventListener('DOMContentLoaded', () => {
    scan(document);
    obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  }, { once: true });
}
