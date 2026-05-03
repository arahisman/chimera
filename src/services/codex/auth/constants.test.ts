import { describe, expect, test } from 'bun:test'

describe('chimera auth constants', () => {
  test('can be pointed at a local OAuth issuer for smoke tests', async () => {
    const proc = Bun.spawn({
      cmd: [
        'bun',
        '-e',
        [
          "import('./src/services/codex/auth/constants.ts').then(constants => {",
          '  console.log(JSON.stringify({',
          '    issuer: constants.CODEX_OAUTH_ISSUER,',
          '    clientId: constants.CODEX_CLIENT_ID,',
          '    port: constants.CODEX_OAUTH_PORT,',
          '    redirectUri: constants.CODEX_OAUTH_REDIRECT_URI,',
          '  }))',
          '})',
        ].join('\n'),
      ],
      env: {
        ...process.env,
        CHIMERA_OAUTH_ISSUER: 'http://127.0.0.1:40123/',
        CHIMERA_OAUTH_CLIENT_ID: 'local-client',
        CHIMERA_OAUTH_PORT: '40124',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(stderr).toBe('')
    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout)).toEqual({
      issuer: 'http://127.0.0.1:40123',
      clientId: 'local-client',
      port: 40124,
      redirectUri: 'http://localhost:40124/auth/callback',
    })
  })
})
