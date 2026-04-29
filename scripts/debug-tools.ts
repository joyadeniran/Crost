import * as dotenv from 'dotenv';
import { Composio } from '@composio/core';

dotenv.config({ path: '.env' });

async function run() {
  try {
    const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
    const params = { appNames: ["gmail"] };
    // const response = await (composio as any).actions.get(params);
    // const gmailActions = response.items.map((a: any) => a.name);
    // console.log("Actions:", gmailActions);
    console.log("Debug tool ready.");
  } catch(e) {
    console.error(e);
  }
}

run();