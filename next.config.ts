import type { NextConfig } from "next";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const githubPagesBasePath = repositoryName ? `/${repositoryName}` : "";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH
  ?? (process.env.GITHUB_ACTIONS === "true" ? githubPagesBasePath : "");

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
