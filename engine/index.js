/* Vlexyna — engine/index.js — ESM barrel.
   Import order matters: module owners before module users.
   Every module also registers onto window.VX for classic-script contexts. */
import './util.js';
import './params.js';
import './expr.js';
import './audio.js';
import './fx.js';
import './fx2.js';
import './layers.js';
import './layers2.js';
import './media.js';
import './layers3.js';
import './renderer.js';
import './project.js';
import './templates.js';
import './exporter.js';
import './offline.js';

export { U, VX } from './util.js';
export { P } from './params.js';
