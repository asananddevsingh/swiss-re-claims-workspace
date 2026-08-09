import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  agentRules: false,
  serverExternalPackages: ['pdf-lib'],

  // The seeded PDF fixtures are read at request time, so they have to travel
  // with the serverless bundle rather than being tree-shaken out.
  outputFileTracingIncludes: {
    '/api/documents/**': ['./storage/documents/**'],
  },
}

export default nextConfig
