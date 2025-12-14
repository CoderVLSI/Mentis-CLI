const fs = require('fs');
const path = require('path');
const os = require('os');

const target = path.join(os.homedir(), 'mentis_debug_write_test.txt');
console.log(`Attempting to write to: ${target}`);
try {
    fs.writeFileSync(target, 'Hello world');
    console.log('Success!');
} catch (e) {
    console.error('Failed:', e);
}
