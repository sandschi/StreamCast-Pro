import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Simple API testing script.
// Create a .env.local file with your USER_ID, TOKEN, and optionally BASE_URL to run.
// Run with: node scripts/test_api.js
async function testApi() {
    // Read from environment variables
    const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
    const USER_ID = process.env.USER_ID;
    const TOKEN = process.env.TOKEN;

    if (!USER_ID || !TOKEN) {
        console.error("Error: USER_ID and TOKEN environment variables must be defined to run this script.");
        console.error("You can add them to your .env.local file or pass them directly.");
        process.exit(1);
    }

    try {
        const url = `${BASE_URL}/api/overlay/${USER_ID}?action=karafun-queue-on&token=${TOKEN}`;
        console.log(`Testing API at: ${url}`);

        const res = await fetch(url, {
            method: "GET"
        });

        const text = await res.text();
        console.log(`Status: ${res.status}`);
        let formattedText = text;
        try {
            formattedText = JSON.stringify(JSON.parse(text), null, 2);
        } catch (e) { }
        console.log(`Body: \n${formattedText}`);
    } catch (err) {
        console.error("Fetch failed:", err);
    }
}

testApi();
