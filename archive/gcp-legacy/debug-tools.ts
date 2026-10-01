import * as dotenv from 'dotenv';
import { Composio } from '@composio/core';

dotenv.config({ path: 'frontend/.env' });

async function run() {
  try {
    const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
    // Assuming userId is not needed just to list actions in a toolkit, or we can just list actions
    const actions = await composio.actions.get();
    const gmailActions = actions.items.filter((a: any) => a.name.startsWith('GMAIL'));
    console.log(gmailActions.map((a: any) => a.name));
  } catch(e) {
    console.error(e);
  }
}

run();