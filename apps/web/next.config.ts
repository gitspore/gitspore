import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: `next build` writes plain HTML/CSS/JS to out/, which the
  // API daemon or any static file server can serve. No Next server at runtime.
  output: "export",
};

export default nextConfig;
