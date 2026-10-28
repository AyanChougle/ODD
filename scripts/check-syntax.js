'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getJsFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === '.git') continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getJsFiles(fullPath));
    } else if (file.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = getJsFiles('.');
console.log(`Checking syntax of ${files.length} JavaScript files...`);

let errors = 0;
for (const file of files) {
  try {
    execSync(`node --check "${file}"`, { stdio: 'pipe' });
  } catch (err) {
    console.error(`Syntax error in ${file}:\n`, err.stderr.toString());
    errors++;
  }
}

if (errors === 0) {
  console.log('All JavaScript files have clean syntax!');
} else {
  console.error(`${errors} files failed syntax check.`);
  process.exit(1);
}
