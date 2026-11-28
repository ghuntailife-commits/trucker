/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // the follow-up emails' PDFs and signature logo are read by the send route on the server (never public)
  outputFileTracingIncludes: { '/api/email/send': ['./assets/email/**'] },
};
