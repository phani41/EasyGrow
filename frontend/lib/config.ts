/**
 * Shared configuration for the EasyGrow frontend.
 *
 * NEXT_PUBLIC_API_URL should be set in the environment:
 * - Production (Vercel): set via Vercel dashboard or .env.production
 * - Local development: set via .env.local
 *
 * The fallback URL is the deployed Render backend.
 * For local development, set NEXT_PUBLIC_API_URL=http://localhost:5000 in .env.local
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://easygrow-zs8n.onrender.com';
