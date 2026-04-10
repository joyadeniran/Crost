// lib/composio-tools.ts
// Central registry for the "Lean" tool policy (Top 5 tools per service).
// Prevents context window explosion by curate-selecting the most powerful tools.

export interface TopTool {
  id: string;
  label: string;
  description: string;
}

export const TOP_TOOLS: Record<string, TopTool[]> = {
  gmail: [
    { id: 'gmail_send_email', label: 'Send Email', description: 'Send a new email with body and subject' },
    { id: 'gmail_list_messages', label: 'List Emails', description: 'List recent emails with snippets' },
    { id: 'gmail_get_message', label: 'Read Email', description: 'Read full content of a specific email' },
    { id: 'gmail_create_draft', label: 'Create Draft', description: 'Prepare an email draft for user review' },
    { id: 'gmail_search_emails', label: 'Search Emails', description: 'Search emails using Gmail query syntax' }
  ],
  github: [
    { id: 'github_list_repositories', label: 'List Repos', description: 'List your GitHub repositories' },
    { id: 'github_get_repository', label: 'Get Repo Details', description: 'Fetch README and branch info for a repo' },
    { id: 'github_list_pull_requests', label: 'List PRs', description: 'List open pull requests in a repository' },
    { id: 'github_get_pull_request', label: 'Read PR', description: 'Read the diff and discussion of a PR' },
    { id: 'github_create_pull_request', label: 'Create PR', description: 'Propose changes via a new pull request' }
  ],
  slack: [
    { id: 'slack_post_message', label: 'Post Message', description: 'Send a message to a Slack channel' },
    { id: 'slack_list_channels', label: 'List Channels', description: 'List all public Slack channels' },
    { id: 'slack_get_channel_history', label: 'Read Channel', description: 'Fetch recent messages from a channel' },
    { id: 'slack_add_reaction', label: 'React', description: 'Add an emoji reaction to a message' },
    { id: 'slack_search_messages', label: 'Search Slack', description: 'Search across all messages and files' }
  ],
  notion: [
    { id: 'notion_list_databases', label: 'List Databases', description: 'Find Notion databases you have access to' },
    { id: 'notion_query_database', label: 'Query Database', description: 'Search for rows in a specific database' },
    { id: 'notion_get_page', label: 'Read Page', description: 'Fetch the text content of a Notion page' },
    { id: 'notion_create_page', label: 'Create Page', description: 'Add a new page or database entry' },
    { id: 'notion_update_page', label: 'Update Page', description: 'Edit existing content or properties' }
  ],
  googlecalendar: [
    { id: 'googlecalendar_list_events', label: 'List Events', description: 'Fetch your calendar schedule' },
    { id: 'googlecalendar_create_event', label: 'Schedule Meeting', description: 'Add a new event to your calendar' },
    { id: 'googlecalendar_update_event', label: 'Update Event', description: 'Reschedule or edit an event' },
    { id: 'googlecalendar_delete_event', label: 'Cancel Event', description: 'Remove an event from the calendar' },
    { id: 'googlecalendar_get_busy_slots', label: 'Check Availability', description: 'Find free time slots' }
  ],
  googlesheets: [
    { id: 'googlesheets_get_spreadsheet', label: 'Read Sheet', description: 'Fetch values from a Google Sheet' },
    { id: 'googlesheets_append_spreadsheet_values', label: 'Add Rows', description: 'Append data to a spreadsheet' },
    { id: 'googlesheets_update_spreadsheet_values', label: 'Edit Cell', description: 'Update specific cells or ranges' },
    { id: 'googlesheets_create_spreadsheet', label: 'Create Sheet', description: 'Initialize a new spreadsheet' },
    { id: 'googlesheets_get_spreadsheet_metadata', label: 'Sheet Info', description: 'Get tab names and structural info' }
  ],
  googledrive: [
    { id: 'googledrive_list_files', label: 'List Files', description: 'Search and list files in Google Drive' },
    { id: 'googledrive_get_file_content', label: 'Download File', description: 'Download content for analysis' },
    { id: 'googledrive_create_folder', label: 'Create Folder', description: 'Organize files into folders' },
    { id: 'googledrive_upload_file', label: 'Upload File', description: 'Save data or reports to Drive' },
    { id: 'googledrive_share_file', label: 'Share File', description: 'Manage permissions and collaborators' }
  ],
  linear: [
    { id: 'linear_list_issues', label: 'List Issues', description: 'Fetch issues from a project or team' },
    { id: 'linear_create_issue', label: 'Create Issue', description: 'Report a new bug or task' },
    { id: 'linear_update_issue', label: 'Update Issue', description: 'Change status or assignee' },
    { id: 'linear_get_issue', label: 'Read Issue', description: 'Get full details of a specific issue' },
    { id: 'linear_list_teams', label: 'List Teams', description: 'Find team IDs for issue creation' }
  ]
};

export const SUPPORTED_TOOLKITS = Object.keys(TOP_TOOLS);
