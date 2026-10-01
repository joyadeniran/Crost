
import { runOrchestratorTask } from '../frontend/lib/llm-client';
import { createServerSupabaseClient } from '../frontend/lib/supabase';

async function reproduceHallucination() {
  console.log('--- REPRODUCTION: Orchestrator Hallucination ---');
  
  // Use a known goal ID or create a dummy one
  // For this test, we just want to see if Orc proposes a non-existent department
  const goalId = '323e1374-2310-4552-94f6-bfd75c9a53da'; // From user's error report
  const prompt = "Design a 2027 new year banner for instagram only";

  try {
    const result = await runOrchestratorTask(prompt, goalId, [], true);
    console.log('Orchestrator Result:', JSON.stringify(result, null, 2));

    if (result.is_valid_goal && result.plan?.tasks) {
      const depts = result.plan.tasks.map((t: any) => t.dept);
      console.log('Proposed Departments:', depts);
      
      // Check against database active departments
      const supabase = createServerSupabaseClient();
      const { data: activeDepts } = await supabase
        .from('departments')
        .select('slug')
        .eq('activation_stage', 'active');
      
      const activeSlugs = (activeDepts || []).map(d => d.slug);
      console.log('Active Departments in DB:', activeSlugs);

      const invalidDepts = depts.filter((d: string) => !activeSlugs.includes(d));
      if (invalidDepts.length > 0) {
        console.error('❌ HALLUCINATION DETECTED! Invalid departments:', invalidDepts);
        process.exit(1);
      } else {
        console.log('✅ No hallucinations detected in this run.');
      }
    }
  } catch (err) {
    console.error('Execution failed:', err);
  }
}

reproduceHallucination();
