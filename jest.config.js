/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.js'],
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    // next-intl ships ESM ts-jest won't transpile; use a lightweight mock in tests.
    '^next-intl$': '<rootDir>/src/test-utils/nextIntlMock.tsx',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  // Type-stripping only, same as the old ts-jest config (diagnostics: false) -
  // actual type-checking is a separate step (npm run type-check). Swapping
  // to SWC decouples the test transform from TypeScript's compiler API
  // entirely, which is what unblocks upgrading to TypeScript 7 (ts-jest's
  // peer range hard-caps at "typescript: >=4.3 <7").
  transform: {
    '^.+\\.tsx?$': ['@swc/jest', {
      jsc: {
        parser: { syntax: 'typescript', tsx: true },
        transform: { react: { runtime: 'automatic' } },
      },
    }],
  },
};
