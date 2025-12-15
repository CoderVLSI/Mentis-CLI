
import axios from 'axios';

async function testConnection() {
    const apiKey = "d6127b23ffa74130bf6fbe3d98dab35a.o3cs6OuoHVuzn894";
    const endpoint = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
    const models = ['glm-4-plus', 'glm-4', 'glm-4-air'];

    console.log("Testing models...");

    for (const model of models) {
        console.log(`\n--- Testing ${model} ---`);
        try {
            const response = await axios.post(
                endpoint,
                {
                    model: model,
                    messages: [{ role: "user", content: "Hi" }]
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    }
                }
            );
            console.log("✅ SUCCESS!");
            console.log("Response:", response.data.choices[0].message.content);
            return; // Exit on first success
        } catch (error: any) {
            console.log("❌ FAILED");
            // console.log("Status:", error.response?.status);
            console.log("Error:", error.response?.data?.error?.message || error.message);
        }
    }
}

testConnection();
