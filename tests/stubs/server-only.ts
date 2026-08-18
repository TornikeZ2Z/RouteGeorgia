// The server-only guard is a build-time marker for Next.js. In vitest we
// alias it away so server modules can be imported directly under Node; the
// real guard still applies to the application build.
export {};
