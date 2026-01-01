/**
 * Example API Route with Environment Validation
 *
 * This demonstrates how to use the environment validation utility
 * in your API routes. Copy this pattern to all critical routes.
 */

import { NextResponse } from 'next/server';
import { validateEnvironment, getValidationErrorResponse, validateSpecificVars } from '@/lib/envValidation';

/**
 * Example: Validate ALL required environment variables
 */
export async function GET(request) {
  // Validate environment before proceeding
  const envCheck = validateEnvironment();

  if (!envCheck.valid) {
    return NextResponse.json(
      getValidationErrorResponse(envCheck),
      { status: 500 }
    );
  }

  // If validation passes, proceed with normal logic
  return NextResponse.json({
    message: 'API route is working correctly',
    environment: 'All required environment variables are set',
  });
}

/**
 * Example: Validate SPECIFIC environment variables
 *
 * Use this when an endpoint only needs certain credentials
 * (e.g., only Spotify API, not database)
 */
export async function POST(request) {
  // Only validate Spotify credentials for this endpoint
  const envCheck = validateSpecificVars([
    'SPOTIFY_CLIENT_ID',
    'SPOTIFY_CLIENT_SECRET',
    'SPOTIFY_REDIRECT_URI',
  ]);

  if (!envCheck.valid) {
    return NextResponse.json(
      getValidationErrorResponse(envCheck),
      { status: 500 }
    );
  }

  // Spotify operations here...
  return NextResponse.json({
    message: 'Spotify credentials are valid',
  });
}
