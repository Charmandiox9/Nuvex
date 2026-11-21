import type { NextConfig } from 'next';
import path from 'node:path';

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.resolve(process.cwd(), '..'),
  poweredByHeader: false,
  agentRules: false,
  async rewrites() {
    const upstream = process.env.API_UPSTREAM ?? 'http://127.0.0.1:3001';
    return [
      { source: '/api/:path*', destination: upstream + '/api/:path*' },
      { source: '/graphql', destination: upstream + '/graphql' }
    ];
  },
};
export default config;
