/**
 * Demo project entry: registers the callout and card demo blocks on the
 * `window.uncialWagtail.customBlocks` registry so the shipped admin bundle can
 * instantiate them for configs listing `custom_blocks=["callout", "card"]`.
 *
 * Registration happens at script-eval time, so this bundle only has to be
 * loaded on the page before the admin bundle initializes its widgets (the demo
 * loads it through the `insert_global_admin_js` hook, which Wagtail renders
 * before any widget media).
 */
import { createCalloutBlock, createCardBlock } from './demoBlocks.js';
import { ensureUncialWagtailGlobal } from './uncialGlobal.js';

const uncialWagtail = ensureUncialWagtailGlobal();
const customBlocks = (uncialWagtail.customBlocks = uncialWagtail.customBlocks ?? {});

customBlocks.callout = createCalloutBlock;
customBlocks.card = createCardBlock;
