const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'src');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

function processFile(filePath) {
  if (!filePath.endsWith('.js') && !filePath.endsWith('.jsx')) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Replace purple, pink, indigo with primary
  // Regex to match `-purple-`, `:purple-`, ` purple-`, etc. in template literals and class strings
  // Example matches: "bg-purple-600", "text-pink-500", "border-indigo-400"
  
  content = content.replace(/\b(?:purple|pink|indigo)-(\d+)(\/[0-9]+)?\b/g, (match, p1, p2) => {
    return `primary-${p1}${p2 || ''}`;
  });

  // Specifically check for dynamic colors in template literals (e.g., `feature.color`-500)
  // But wait, the feature arrays in page.js have `color: 'purple'`, `color: 'pink'`, `color: 'indigo'`.
  // We need to change those data structures as well.
  content = content.replace(/color:\s*'(purple|pink|indigo)'/g, "color: 'primary'");

  // Image src="/logo.png" -> src="/logo.svg" 
  content = content.replace(/src="\/logo\.png"/g, 'src="/logo.svg"');
  content = content.replace(/icon:\s*"\/logo\.png"/g, 'icon: "/logo.svg"');
  content = content.replace(/apple:\s*"\/logo\.png"/g, 'apple: "/logo.svg"');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
  }
}

walkDir(directoryPath, processFile);
console.log('Done replacing colors and logo paths.');
