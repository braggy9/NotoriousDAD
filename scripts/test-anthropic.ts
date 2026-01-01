// Test Anthropic API connection
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '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',
});

async function testAPI() {
  console.log('🧪 Testing Anthropic API...\n');

  const models = [
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ];

  for (const model of models) {
    console.log(`Testing ${model}...`);
    try {
      const message = await anthropic.messages.create({
        model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      console.log(`✅ ${model} works!\n`);
      break; // Stop on first success
    } catch (error: any) {
      console.log(`❌ ${model} failed: ${error.message}\n`);
    }
  }
}

testAPI().catch(console.error);
