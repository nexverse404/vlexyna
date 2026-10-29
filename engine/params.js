/* Vlexyna — params.js — param schema helpers shared by layers & effects */
'use strict';
import { VX } from './util.js';
const P = VX.P = {
    num: (key, label, min, max, step, def, opts) => ({ t: 'num', key, label, min, max, step, def, ...opts }),
    color: (key, label, def, opts) => ({ t: 'color', key, label, def, ...opts }),
    sel: (key, label, options, def, opts) => ({ t: 'sel', key, label, options, def, ...opts }),
    bool: (key, label, def, opts) => ({ t: 'bool', key, label, def, ...opts }),
    text: (key, label, def, opts) => ({ t: 'text', key, label, def, ...opts }),
    area: (key, label, def, opts) => ({ t: 'area', key, label, def, ...opts }),
    file: (key, label, accept, opts) => ({ t: 'file', key, label, accept, ...opts }),
    act: (key, label, fn) => ({ t: 'act', key, label, fn }),
    group: (label, params, opts) => ({ t: 'group', label, params, ...opts }),
  };
export { P };
