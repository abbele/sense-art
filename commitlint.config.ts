import type { UserConfig } from '@commitlint/types'

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Scope must be one of the known packages/apps or empty
    'scope-enum': [
      2,
      'always',
      [
        'sense-art',   // packages/sense-art
        'demo-osd',    // apps/demo-osd
        'demo-storiiies', // apps/demo-storiiies
        'ci',          // github actions / release pipeline
        'docs',        // README, ARCHITECTURE, ROADMAP, DOC_GUIDE
        'deps',        // dependency updates
        'release',     // changesets / version bumps
      ],
    ],
    'scope-empty': [1, 'never'], // warn (not error) if scope is missing
  },
}

export default config
