// /api/analyze.js — EXAMPLE Vercel Serverless Function (runs on the server).
//
// This is the pattern for anything that needs a SECRET key the browser must
// never see — e.g. a video-analysis API, the YouTube Data API, Stripe, etc.
// Read them from process.env (NO VITE_ prefix), call the third-party API here,
// and return only the result to the client.
//
// The client calls it with:   await fetch('/api/analyze')   (or POST with a body)
//
// Add the secret in Vercel → Project Settings → Environment Variables, e.g.
//   GEMINI_API_KEY = ...      (server-only — do NOT prefix with VITE_)

export default function handler(req, res) {
  const geminiConfigured = !!process.env.GEMINI_API_KEY;
  const youtubeConfigured = !!process.env.YOUTUBE_API_KEY;

  // Example of where you'd do real server-side work, e.g.:
  //   const r = await fetch('https://generativelanguage.googleapis.com/...', {
  //     headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY }, ...
  //   });
  //   const data = await r.json();
  //   return res.status(200).json(data);

  res.status(200).json({
    ok: true,
    message: 'Server function reachable. Put secret-key calls here.',
    geminiConfigured,
    youtubeConfigured,
  });
}
