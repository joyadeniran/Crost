
import { loadSkillsForTask } from '../frontend/lib/skills';

async function testSkillLoading() {
  console.log('--- TESTING: Skill Loading for Image/Design ---');
  
  const actions = [
    'design_banner',
    'generate_image',
    'create_logo',
    'graphic_design',
    'write_report' // Baseline
  ];

  for (const action of actions) {
    const { content, slugs } = await loadSkillsForTask(action, 'marketing', {});
    console.log(`Action: "${action}" -> Slugs: [${slugs.join(', ')}]`);
    if (action.includes('design') || action.includes('image') || action.includes('logo')) {
      if (slugs.includes('image')) {
        console.log('✅ Correct skill loaded.');
      } else {
        console.error('❌ Failed to load image skill.');
      }
    }
  }
}

testSkillLoading();
