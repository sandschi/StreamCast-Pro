const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'src');

/**
 * Recursively walks a directory and executes a callback for each file.
 */
function walkDir(dir, callback) {
  try {
    const files = fs.readdirSync(dir);
    files.forEach(f => {
      const dirPath = path.join(dir, f);
      try {
        const stats = fs.statSync(dirPath);
        if (stats.isDirectory()) {
          walkDir(dirPath, callback);
        } else {
          callback(dirPath);
        }
      } catch (err) {
        console.error(`Error statting ${dirPath}:`, err.message);
      }
    });
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err.message);
  }
}

/**
 * Processes a file by replacing color classes and logo paths.
 */
function processFile(filePath) {
  // Support .js, .jsx, .ts, .tsx
  if (!/\.(js|jsx|ts|tsx)$/.test(filePath)) return;
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let updatedContent = content;

    // 1. Replace purple, pink, indigo with primary
    // Regex matches common Tailwind patterns like bg-purple-600, text-pink-500/50, border-indigo-400
    updatedContent = updatedContent.replace(/\b(?:purple|pink|indigo)-(\d+)(\/[0-9]+)?\b/g, (match, shade, opacity) => {
      return `primary-${shade}${opacity || ''}`;
    });

    // 2. Standardize color properties in objects (e.g., color: 'purple')
    updatedContent = updatedContent.replace(/color:\s*'(purple|pink|indigo)'/g, "color: 'primary'");

    // 3. Update logo paths
    updatedContent = updatedContent.replace(/src="\/logo\.png"/g, 'src="/logo.svg"');
    updatedContent = updatedContent.replace(/icon:\s*"\/logo\.png"/g, 'icon: "/logo.svg"');
    updatedContent = updatedContent.replace(/apple:\s*"\/logo\.png"/g, 'apple: "/logo.svg"');

    if (updatedContent !== content) {
      fs.writeFileSync(filePath, updatedContent, 'utf8');
      console.log(`[SUCCESS] Updated: ${filePath}`);
    }
  } catch (err) {
    console.error(`[ERROR] Processing ${filePath}:`, err.message);
  }
}

console.log('Starting color and asset migration...');
walkDir(directoryPath, processFile);
console.log('Migration complete.');
