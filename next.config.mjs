/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // PeerJS connections break under double-mount in dev strict mode
};

export default nextConfig;
