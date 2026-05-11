require('dotenv').config();

async function listModels() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.models) {
      console.log("Available Models:");
      data.models.forEach(m => {
        console.log(`- ${m.name}`);
      });
    } else {
      console.log("No models found or error:", JSON.stringify(data));
    }
  } catch (error) {
    console.error("Error fetching models:", error.message);
  }
}

listModels();
