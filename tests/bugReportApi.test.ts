import { afterEach, describe, expect, it, vi } from 'vitest'

interface TestResponse {
  code: number
  body: unknown
  status(code: number): TestResponse
  json(body: unknown): void
}

function makeResponse(): TestResponse {
  return {
    code: 200,
    body: undefined,
    status(code: number) {
      this.code = code
      return this
    },
    json(body: unknown) {
      this.body = body
    }
  }
}

async function loadHandler(): Promise<typeof import('../api/bug-report.ts').default> {
  vi.resetModules()
  process.env.GITHUB_TOKEN = 'token'
  process.env.GITHUB_REPO = 'owner/repo'
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ html_url: 'https://github.com/owner/repo/issues/1', number: 1 }),
    text: async () => ''
  })))
  return (await import('../api/bug-report.ts')).default
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.GITHUB_TOKEN
  delete process.env.GITHUB_REPO
})

describe('/api/bug-report abuse controls', () => {
  it('rejects honeypot submissions before filing an issue', async () => {
    const handler = await loadHandler()
    const res = makeResponse()

    await handler({ method: 'POST', body: { summary: 'Spam', website: 'https://spam.test' } }, res)

    expect(res.code).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rate-limits more than five reports per IP in the window', async () => {
    const handler = await loadHandler()
    const req = {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.4, 198.51.100.8' },
      body: { summary: 'A real bug' }
    }

    for (let i = 0; i < 5; i++) {
      const res = makeResponse()
      await handler(req, res)
      expect(res.code).toBe(201)
    }

    const limited = makeResponse()
    await handler(req, limited)

    expect(limited.code).toBe(429)
    expect(fetch).toHaveBeenCalledTimes(5)
  })
})
