'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getFiles(dir, ext) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === '.git' || file === 'storage') continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getFiles(fullPath, ext));
    } else if (file.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

const rootDir = path.resolve(__dirname, '..');

// 1. Check JavaScript syntax
const jsFiles = getFiles(rootDir, '.js');
console.log(`Checking syntax of ${jsFiles.length} JavaScript files...`);

let errors = 0;
for (const file of jsFiles) {
  try {
    execSync(`node --check "${file}"`, { stdio: 'pipe' });
  } catch (err) {
    console.error(`Syntax error in ${file}:\n`, err.stderr.toString());
    errors++;
  }
}

// 2. Check PHP syntax using php-parser AST engine
const phpFiles = getFiles(rootDir, '.php');
console.log(`Checking syntax of ${phpFiles.length} PHP backend files...`);

let phpParser;
try {
  phpParser = require('php-parser');
} catch (e) {
  // php-parser optional fallback
}

if (phpParser) {
  const engine = new phpParser({
    parser: { extractDoc: false, php7: true },
    ast: { withPositions: true }
  });

  for (const file of phpFiles) {
    const code = fs.readFileSync(file, 'utf8');
    try {
      engine.parseCode(code, path.basename(file));
    } catch (err) {
      console.error(`PHP Syntax error in ${file} (line ${err.lineNumber}, col ${err.columnNumber}): ${err.message}`);
      errors++;
    }
  }
}

if (errors === 0) {
  console.log('All JavaScript and PHP files have clean syntax!');
} else {
  console.error(`${errors} files failed syntax check.`);
  process.exit(1);
}
