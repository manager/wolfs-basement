// Pre/post fix validation script for Wolf's Basement
// Tests code patterns exist in source files — does NOT require server restart
// Run: node test-fixes.js

const fs = require('fs');
const path = require('path');

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const client = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const game = fs.readFileSync(path.join(__dirname, 'public', 'game', 'main.js'), 'utf8');

let pass = 0, fail = 0;

function check(name, condition) {
  if (condition) {
    console.log(`  PASS  ${name}`);
    pass++;
  } else {
    console.log(`  FAIL  ${name}`);
    fail++;
  }
}

console.log('\n=== Fix 1: Whip emitter cleanup (main.js) ===');
check('Whip emitter is stored in a variable', /const\s+\w+\s*=\s*this\.add\.particles\(agent\.x,\s*agent\.y/.test(game));
check('Whip emitter is destroyed after explode', /\.destroy\(\)/.test(game.slice(game.indexOf('Whip crack particles'), game.indexOf('Whip crack particles') + 500)));

console.log('\n=== Fix 2: lineBuf cap (server.js) ===');
check('lineBuf has size cap check', /lineBuf\.length\s*>/.test(server));
check('lineBuf is reset when too large', /lineBuf\s*=\s*''/.test(server));

console.log('\n=== Fix 3: Process cleanup race (server.js) ===');
check('Kill pending flag exists', /killPending|_killing/.test(server));
check('Close handler checks kill flag', /killPending|_killing/.test(server.slice(server.indexOf('proc.on(\'close\''))));

console.log('\n=== Fix 4: Summon lock (server.js) ===');
check('Summoning state exists', /summoning|_summoning/.test(server));
check('summonAgent checks summoning state', /summoning/.test(server.slice(server.indexOf('function summonAgent'), server.indexOf('function sendCommand'))));

console.log('\n=== Fix 5: Graceful shutdown (server.js) ===');
check('SIGINT handler exists', /process\.on\(['"]SIGINT/.test(server));
check('Shutdown kills agent processes', /agent\.process/.test(server.slice(server.indexOf('function shutdown'))));

console.log('\n=== Fix 6: outputBuffer trim on every push (server.js) ===');
// Should trim in multiple places, not just in result handler
const pushCount = (server.match(/outputBuffer\.push/g) || []).length;
const trimCount = (server.match(/outputBuffer\.length\s*>/g) || []).length;
check(`outputBuffer trimmed in multiple places (pushes: ${pushCount}, trims: ${trimCount})`, trimCount >= 2);

console.log('\n=== Fix 7: Search clear before re-search (index.html) ===');
// termSearchClear() is called at the top of termSearchExec, before highlighting
check('termSearchClear called before search highlighting', /function termSearchExec[\s\S]{0,50}termSearchClear\(\)/.test(client));

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail > 0 ? 1 : 0);
