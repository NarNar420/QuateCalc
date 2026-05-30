/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages are shipped as TypeScript source; let Next transpile them.
  transpilePackages: [
    "@quatecalc/contracts",
    "@quatecalc/db",
    "@quatecalc/export",
    "@quatecalc/matching",
    "@quatecalc/pricing",
    "@quatecalc/units",
  ],
  // Prisma must stay external to the server bundle.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  // The @quatecalc/* workspace packages ship raw TS using NodeNext-style ".js"
  // import specifiers; teach webpack to resolve those to the .ts source.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
