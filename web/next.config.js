/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Only print Sentry's own build-time logging in CI, not on every
  // local dev/build run — keeps normal build output readable.
  silent: !process.env.CI,
  // No account/org set up yet, or a local dev build — withSentryConfig
  // itself handles a missing org/project gracefully (skips source map
  // upload, wraps nothing extra), so this doesn't need its own branch.
});

