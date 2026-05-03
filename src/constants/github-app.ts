export const PR_TITLE = 'Add Chimera GitHub Workflow'

export const GITHUB_ACTION_SETUP_DOCS_URL =
  'https://developers.openai.com/codex/'

export const WORKFLOW_CONTENT = `name: Chimera

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned]
  pull_request_review:
    types: [submitted]

jobs:
  chimera:
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@chimera')) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@chimera')) ||
      (github.event_name == 'pull_request_review' && contains(github.event.review.body, '@chimera')) ||
      (github.event_name == 'issues' && (contains(github.event.issue.body, '@chimera') || contains(github.event.issue.title, '@chimera')))
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write
      actions: read # Required for Chimera to read CI results on PRs
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Run Chimera
        id: chimera
        uses: openai/codex-action@v1
        with:
          openai_api_key: \${{ secrets.OPENAI_API_KEY }}

          # This is an optional setting that allows Chimera to read CI results on PRs
          additional_permissions: |
            actions: read

          # Optional: Give a custom prompt to Chimera. If this is not specified, Chimera will perform the instructions specified in the comment that tagged it.
          # prompt: 'Update the pull request description to include a summary of changes.'

          # Optional: Add chimera_args to customize behavior and configuration
          # See https://developers.openai.com/codex/ for available options
          # chimera_args: '--allowed-tools Bash(gh pr:*)'

`

export const PR_BODY = `## 🤖 Installing Chimera GitHub App

This PR adds a GitHub Actions workflow that enables Chimera integration in our repository.

### What is Chimera?

[Chimera](https://developers.openai.com/codex/) is an AI coding agent that can help with:
- Bug fixes and improvements  
- Documentation updates
- Implementing new features
- Code reviews and suggestions
- Writing tests
- And more!

### How it works

Once this PR is merged, we'll be able to interact with Chimera by mentioning @chimera in a pull request or issue comment.
Once the workflow is triggered, Chimera will analyze the comment and surrounding context, and execute on the request in a GitHub action.

### Important Notes

- **This workflow won't take effect until this PR is merged**
- **@chimera mentions won't work until after the merge is complete**
- The workflow runs automatically whenever Chimera is mentioned in PR or issue comments
- Chimera gets access to the entire PR or issue context including files, diffs, and previous comments

### Security

- Our OpenAI API key is securely stored as a GitHub Actions secret
- Only users with write access to the repository can trigger the workflow
- All Chimera runs are stored in the GitHub Actions run history
- Chimera's default tools are limited to reading/writing files and interacting with our repo by creating comments, branches, and commits.
- We can add more allowed tools by adding them to the workflow file like:

\`\`\`
allowed_tools: Bash(npm install),Bash(npm run build),Bash(npm run lint),Bash(npm run test)
\`\`\`

There's more information in the [OpenAI Codex docs](https://developers.openai.com/codex/).

After merging this PR, let's try mentioning @chimera in a comment on any PR to get started!`

export const CODE_REVIEW_PLUGIN_WORKFLOW_CONTENT = `name: Chimera Review

on:
  pull_request:
    types: [opened, synchronize, ready_for_review, reopened]
    # Optional: Only run on specific file changes
    # paths:
    #   - "src/**/*.ts"
    #   - "src/**/*.tsx"
    #   - "src/**/*.js"
    #   - "src/**/*.jsx"

jobs:
  chimera-review:
    # Optional: Filter by PR author
    # if: |
    #   github.event.pull_request.user.login == 'external-contributor' ||
    #   github.event.pull_request.user.login == 'new-developer' ||
    #   github.event.pull_request.author_association == 'FIRST_TIME_CONTRIBUTOR'

    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Run Chimera Review
        id: chimera-review
        uses: openai/codex-action@v1
        with:
          openai_api_key: \${{ secrets.OPENAI_API_KEY }}
          plugin_marketplaces: 'https://github.com/openai/codex.git'
          plugins: 'code-review@chimera-plugins'
          prompt: '/code-review:code-review \${{ github.repository }}/pull/\${{ github.event.pull_request.number }}'
          # See https://developers.openai.com/codex/ for available options

`
