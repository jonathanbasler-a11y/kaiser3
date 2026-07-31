// Vercel serverless function: files an in-game bug report as a GitHub issue.
// This is the one intentional exception to CLAUDE.md's "no backend" rule —
// bug reports need to outlive a static deploy, and GitHub issues are durable,
// free, and readable from a terminal (`gh issue list`) without any extra infra.

interface VercelRequest {
  method?: string
  body: unknown
}

interface VercelResponse {
  status(code: number): VercelResponse
  json(body: unknown): void
}

interface BugReportPayload {
  summary: string
  details?: string
  tab?: string
  year?: number
  rank?: string
  userAgent?: string
}

const MAX_SUMMARY = 200
const MAX_DETAILS = 4000

function isBugReportPayload(body: unknown): body is BugReportPayload {
  if (typeof body !== 'object' || body === null) return false
  const b = body as Record<string, unknown>
  return typeof b.summary === 'string' && b.summary.trim().length > 0
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (!isBugReportPayload(req.body)) {
    res.status(400).json({ error: 'A non-empty "summary" field is required.' })
    return
  }

  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO
  if (!token || !repo) {
    res.status(500).json({ error: 'Bug reporting is not configured on this deployment.' })
    return
  }

  const { summary, details, tab, year, rank, userAgent } = req.body
  const title = summary.trim().slice(0, MAX_SUMMARY)

  const bodyLines = [
    details ? details.trim().slice(0, MAX_DETAILS) : '_(no details provided)_',
    '',
    '---',
    '**Context**',
    tab ? `- Tab: ${tab}` : null,
    typeof year === 'number' ? `- Year: ${year}` : null,
    rank ? `- Rank: ${rank}` : null,
    userAgent ? `- User agent: ${userAgent}` : null,
    `- Reported: ${new Date().toISOString()}`
  ].filter((line): line is string => line !== null)

  const ghResponse = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({
      title: `[bug report] ${title}`,
      body: bodyLines.join('\n'),
      labels: ['bug-report']
    })
  })

  if (!ghResponse.ok) {
    const errText = await ghResponse.text()
    res.status(502).json({ error: `Failed to file report: ${errText}` })
    return
  }

  const issue = (await ghResponse.json()) as { html_url: string; number: number }
  res.status(201).json({ url: issue.html_url, number: issue.number })
}
