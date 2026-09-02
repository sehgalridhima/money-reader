import type { NextConfig } from "next";

/*
 * Nothing here needs configuring, and that is the point: no upload
 * handling, no file size limits, no storage. The PDF is read in the
 * browser, so the server never sees one.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
