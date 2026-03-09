async function testApi() {
    try {
        const res = await fetch("http://localhost:3000/api/overlay/520983375885107200?action=karafun-queue-on&token=test", {
            method: "GET"
        });

        const text = await res.text();
        console.log(`Status: ${res.status}`);
        console.log(`Body: ${text}`);
    } catch (err) {
        console.error("Fetch failed:", err);
    }
}

testApi();
