/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // needed for infra/docker/web.Dockerfile (Production path)
  transpilePackages: ["@fi/ui", "@fi/contracts", "three"],
};

export default nextConfig;
