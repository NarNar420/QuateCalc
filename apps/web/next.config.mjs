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
};

export default nextConfig;
