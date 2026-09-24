/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  output: "standalone",         // needed for infra/docker/web.Dockerfile (Production path)
  transpilePackages: ["@fi/ui", "@fi/contracts"],
};
