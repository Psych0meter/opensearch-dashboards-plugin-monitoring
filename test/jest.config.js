/*
 * Unit tests for the plugin's pure modules (formatters, error mapping,
 * inventory matching, refresh scheduling). Run from the plugin directory
 * inside an OpenSearch Dashboards checkout: `yarn test`.
 */
module.exports = {
  rootDir: '../',
  roots: ['<rootDir>/common', '<rootDir>/server', '<rootDir>/public'],
  testMatch: ['**/*.test.ts'],
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  transform: {
    '^.+\\.(js|tsx?)$': '<rootDir>/../../src/dev/jest/babel_transform.js',
  },
};
