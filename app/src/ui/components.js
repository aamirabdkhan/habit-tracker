// Shared render pieces used across views.
import { icon } from '../core/dom.js';

/** Bottom tab bar (the four modes). Settings is reached via the gear, not a tab. */
export function bottomTabs(active) {
  const tab = (view, label, ic) =>
    `<button class="tab ${active === view ? 'on' : ''}" data-view="${view}">${icon(ic)}${label}</button>`;
  return (
    tab('today', 'Today', 'home') +
    tab('pehar', 'Pehar', 'clock') +
    tab('overview', 'Overview', 'chart') +
    tab('template', 'Template', 'list')
  );
}

/** Editorial section header: 01  NAME            meta */
export const sectionHead = (num, name, meta = '') =>
  `<div class="sec-h"><span class="sec-num">${num}</span><span class="sec-name">${name}</span><span class="sec-meta">${meta}</span></div>`;
