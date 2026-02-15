const fs = require('fs');
const content = fs.readFileSync('webkcs.js', 'utf8');

let results = "";

// Find all message names
const names = content.match(/name:"([^"]+)"/g) || [];
results += "Message Names found:\n";
results += JSON.stringify(names.map(n => n.slice(6, -1)), null, 2);

// Find context around ProcessRemoteLoginRequest
const index = content.indexOf('auth.ProcessRemoteLoginRequest');
if (index !== -1) {
    results += "\n\nContext around ProcessRemoteLoginRequest:\n";
    results += content.slice(Math.max(0, index - 300), index + 300);
}

// Search for 'channel'
const channelIndex = content.indexOf('channel');
if (channelIndex !== -1) {
    results += "\n\nContext around 'channel':\n";
    results += content.slice(Math.max(0, channelIndex - 200), channelIndex + 200);
}

fs.writeFileSync('trace_results.txt', results);
console.log("Done. Results in trace_results.txt");
