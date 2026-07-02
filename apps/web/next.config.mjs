/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The dashboard is a pure client of the REST API — configure its base URL here.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  },
};

export default nextConfig;
