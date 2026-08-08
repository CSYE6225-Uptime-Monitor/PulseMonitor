module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
  collectCoverageFrom: ['src/**/*.js'],
  // supertest agents keep the Express app bound to a port; forceExit closes
  // those sockets after all tests complete, preventing ECONNRESET races
  // between test files that share the same app singleton.
  forceExit: true,
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
