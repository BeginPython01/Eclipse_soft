/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // SPEC §8 SEC-18: the AI API key is server-side only. Nothing AI_* is ever
  // exposed through `env` here — that would inline it into the client bundle.
};

export default nextConfig;
