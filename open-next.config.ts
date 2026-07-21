import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default {
  ...defineCloudflareConfig(),
  // OpenNext shells out to `npm run build` to compile the Next.js app. Since
  // package.json's `build` is `opennextjs-cloudflare build` (Cloudflare Workers
  // Builds runs `npm run build` and can't be talked out of it), that default
  // would re-enter this same command forever. Point it straight at Next.
  buildCommand: "npx next build",
};
