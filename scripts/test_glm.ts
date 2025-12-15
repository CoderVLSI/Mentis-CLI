
import axios from 'axios';
import inquirer from 'inquirer';

async function testConnection() {
    console.log("GLM-4.6 Connection Tester");

    const apiKey = "d6127b23ffa74130bf6fbe3d98dab35a.o3cs6OuoHVuzn894";
    console.log("Using provided key...");

    const { endpoint } = await inquirer.prompt([{
        type: 'list',
        name: 'endpoint',
        message: 'Select Endpoint to Test:',
        choices: [
            'https://open.bigmodel.cn/api/paas/v4/chat/completions',
            'https://api.z.ai/api/paas/v4/chat/completions'
        ]
    }]);

    const { model } = await inquirer.prompt([{
        type: 'list',
        name: 'model',
        message: 'Select Model ID:',
        choices: ['glm-4.6', 'glm-4', 'glm-4-plus']
    }]);

    console.log(`\nTesting ${model} @ ${endpoint} ...`);

    try {
        const response = await axios.post(
            endpoint,
            {
                model: model,
                messages: [{ role: "user", content: "Hello, are you working?" }]
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                }
            }
        );
        console.log("\n✅ SUCCESS!");
        console.log("Response:", response.data.choices[0].message.content);
    } catch (error: any) {
        console.log("\n❌ FAILED");
        console.log("Status:", error.response?.status);
        console.log("Data:", JSON.stringify(error.response?.data, null, 2));
    }
}

testConnection();
