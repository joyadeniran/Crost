import { runOrchestratorTask } from '../frontend/lib/onyx-client';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';

dotenv.config({ path: 'frontend/.env.local' });

async function testOrc() {
  const goalId = crypto.randomUUID();
  try {
    const res = await runOrchestratorTask(
      "I want to improve our marketing outreach this quarter",
      goalId,
      [],
      false
    );
    console.log("Success!");
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("Test failed:", err);
  }
}

testOrc();
