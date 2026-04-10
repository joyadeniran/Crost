'use client'

import { ModelAssignmentForm } from '@/components/settings/ModelAssignmentForm'

export default function ModelsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Model Configuration</h1>
          <p className="text-gray-600">
            Manage your API keys and assign models to different roles (Bring Your Own Key)
          </p>
        </div>

        <div className="bg-white rounded-lg shadow">
          <ModelAssignmentForm />
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">How it works</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• <strong>Reasoning Role:</strong> Used by Orc for planning and analysis</li>
            <li>• <strong>Execution Role:</strong> Used by workers for tool calls and task execution</li>
            <li>• <strong>Utility Role:</strong> Used for memo generation and lightweight tasks</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
