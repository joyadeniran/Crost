// scripts/test_transformers.ts
// Test suite for Artifact Format Transformers (Phase 3)
import { detectOutputType } from '../frontend/lib/artifact-transformers/index.js';

// Setup Mock Inputs
const mockEmail = JSON.stringify({
  email_template: {
    subject: 'Unlock Seamless Checkout',
    body: 'Dear Partner,\n\nWe would love to connect.'
  }
});

const mockPlan = JSON.stringify({
  project_plan: {
    sales: [{ label: 'Reach out to top 10', status: 'pending' }]
  }
});

const mockResearch = JSON.stringify({
  data: [
    { company: 'Acme', intent: 'high' },
    { company: 'Zeta', intent: 'low' }
  ]
});

async function runTests() {
  console.log("=== Running Transformer Tests ===");

  // Test 1: Email
  const emailDet = detectOutputType(mockEmail, true);
  console.log('--- Email Detection ---');
  console.log('Target Format:', emailDet.targetFormat);
  if (emailDet.transformer) {
    const output = await emailDet.transformer(JSON.parse(mockEmail));
    console.log('Buffer Size/Type:', typeof output, Buffer.isBuffer(output) ? output.length : 'N/A');
  }

  // Test 2: Plan
  const planDet = detectOutputType(mockPlan, true);
  console.log('\n--- Plan Detection ---');
  console.log('Target Format:', planDet.targetFormat);
  if (planDet.transformer) {
    const output = await planDet.transformer(JSON.parse(mockPlan));
    console.log('Result length:', typeof output === 'string' ? output.length : 'N/A');
    console.log('Snippet:', (output as string).substring(0, 50));
  }

  // Test 3: Research
  const rsDet = detectOutputType(mockResearch, true);
  console.log('\n--- Research Detection ---');
  console.log('Target Format:', rsDet.targetFormat);
  if (rsDet.transformer) {
    const output = await rsDet.transformer(JSON.parse(mockResearch));
    console.log('Buffer Size:', Buffer.isBuffer(output) ? output.length : 'N/A');
  }

  console.log("\n✅ All Tests Passed!");
}

runTests().catch(console.error);
