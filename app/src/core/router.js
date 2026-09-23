// Router — renders the active view into #view and keeps the tab bar in sync.
// Views are plain modules exporting { render(state) -> html, actions }.

import { get, set, subscribe } from './state.js';
import { bottomTabs } from '../ui/components.js';
import * as today from '../ui/today.js';
import * as overview from '../ui/overview.js';
import * as pehar from '../ui/pehar.js';
import * as template from '../ui/template.js';
import * as settings from '../ui/settings.js';
import * as onboarding from '../ui/onboarding.js';

const views = { today, overview, pehar, template, settings, onboarding };

export function startRouter() {
  const viewEl = document.getElementById('view');
  const tabsEl = document.getElementById('tabs');

  // One delegated listener set for all view interactions; dispatch to the
  // active view's `actions` map by [data-a].
  ['click', 'input', 'change', 'keydown'].forEach((type) => {
    viewEl.addEventListener(type, (e) => {
      const t = e.target.closest('[data-a]');
      if (!t) return;
      const v = views[get().view];
      const fn = v && v.actions && v.actions[t.dataset.a];
      if (fn) fn(t.dataset, t, e);
    });
  });

  // Tab navigation.
  tabsEl.addEventListener('click', (e) => {
    const t = e.target.closest('[data-view]');
    if (t) set({ view: t.dataset.view });
  });

  subscribe(render);
  render(get());
}

function render(state) {
  const v = views[state.view] || views.today;
  document.getElementById('view').innerHTML = v.render(state);
  const tabs = document.getElementById('tabs');
  tabs.hidden = (state.view === 'settings' || state.view === 'onboarding'); // pushed/full screens, not tabs
  tabs.innerHTML = bottomTabs(state.view);
  window.scrollTo(0, 0);
}
