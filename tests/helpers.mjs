// Loads js/*.js into one node:vm context, like <script> tags sharing the page's
// global scope. Fixtures are built in the tests (synthetic events), never real game data.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function load(files, globals = {}) {
  const ctx = vm.createContext({ console, ...globals });
  for (const f of files) {
    vm.runInContext(readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8'), ctx, { filename: `js/${f}` });
  }
  // Top-level const/function declarations live in the context's global lexical scope.
  return expr => vm.runInContext(expr, ctx);
}

// Plain copy, so deepEqual does not trip over objects created in another realm.
export const plain = o => JSON.parse(JSON.stringify(o));

// One RPG Maker event command.
export const c = (code, indent, parameters = []) => ({ code, indent, parameters });
