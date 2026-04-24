/**
 * Processing Copy — Crost Spec §2 Beat 8
 *
 * Canonical loading messages for the War Room and processing states.
 * All copy is office-themed or warm-playful. Weapons / combat / aggression
 * language is permanently banned.
 *
 * Usage:
 *   import { getRandomProcessingMessage } from '@/lib/processing-copy'
 *   const text = getRandomProcessingMessage()
 */

const OFFICE_THEMED: string[] = [
  'Preparing your first mission',
  'Drawing strategy',
  'Coordinating departments',
  'Drafting artefacts',
  'Reviewing company context',
  'Building your war room',
  'Briefing the team',
  'Reading the room',
  'Connecting the dots',
  'Sketching the plan',
  'Aligning departments',
  'Pulling references',
]

const WARM_PLAYFUL: string[] = [
  'Putting on the boots',
  'Sharpening the pencils',
  'Clearing the desk',
  'Pinning the notes',
  'Warming up the team',
  'Pouring the coffee',
]

/**
 * Returns a random processing message from the canonical list.
 * @param playfulChance - probability (0–1) of picking a warm-playful variant.
 *                        Default 0.2 (sparingly, per spec).
 */
export function getRandomProcessingMessage(playfulChance = 0.2): string {
  const usePlayful = Math.random() < playfulChance
  const pool = usePlayful ? WARM_PLAYFUL : OFFICE_THEMED
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * Returns a deterministic message based on an index.
 * Useful when you want consistent copy across re-renders.
 */
export function getProcessingMessageByIndex(index: number): string {
  const combined = [...OFFICE_THEMED, ...WARM_PLAYFUL]
  return combined[index % combined.length]
}

/**
 * Full canonical list for external reference (e.g. tests, audits).
 */
export function getAllProcessingMessages(): {
  office: string[]
  playful: string[]
} {
  return {
    office: [...OFFICE_THEMED],
    playful: [...WARM_PLAYFUL],
  }
}
