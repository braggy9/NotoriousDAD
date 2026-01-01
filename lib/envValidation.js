/**
 * Environment Variable Validation Utility
 *
 * This utility validates that all required environment variables are set
 * before critical operations. It provides helpful error messages to users
 * and prevents silent failures due to missing configuration.
 *
 * Usage:
 *   import { validateEnvironment, getValidationErrorResponse } from '@/lib/envValidation';
 *
 *   const envCheck = validateEnvironment();
 *   if (!envCheck.valid) {
 *     return getValidationErrorResponse(envCheck);
 *   }
 */

/**
 * Required environment variables and their descriptions
 * Used for validation and generating helpful error messages
 */
const REQUIRED_ENV_VARS = {
  // Spotify API - Required for all music operations
  SPOTIFY_CLIENT_ID: 'Spotify API client ID (from developer.spotify.com)',
  SPOTIFY_CLIENT_SECRET: 'Spotify API client secret',
  SPOTIFY_REDIRECT_URI: 'Spotify OAuth redirect URI',

  // Claude AI - Required for playlist quality reviews
  ANTHROPIC_API_KEY: 'Claude AI (Anthropic) API key for quality reviews',

  // Database - Required for persistence
  POSTGRES_URL: 'Vercel Postgres connection URL',

  // NextAuth - Required for session management
  NEXTAUTH_SECRET: 'NextAuth secret for session encryption',
  NEXTAUTH_URL: 'Application URL for NextAuth',
};

/**
 * Optional but recommended environment variables
 * These aren't critical for basic operation but enable additional features
 */
const OPTIONAL_ENV_VARS = {
  POSTGRES_PRISMA_URL: 'Prisma-compatible Postgres URL (recommended)',
  POSTGRES_URL_NON_POOLING: 'Non-pooling Postgres URL for migrations (recommended)',
};

/**
 * Validates that all required environment variables are set
 *
 * @returns {Object} Validation result
 * @returns {boolean} valid - Whether all required variables are set
 * @returns {string} error - Error message if validation failed
 * @returns {Array<string>} missing - Array of missing variable names
 * @returns {Array<string>} warnings - Array of warning messages for optional vars
 */
export function validateEnvironment() {
  const missing = [];
  const warnings = [];

  // Check required variables
  for (const [key, description] of Object.entries(REQUIRED_ENV_VARS)) {
    if (!process.env[key]) {
      missing.push({ key, description });
    }
  }

  // Check optional variables (for warnings)
  for (const [key, description] of Object.entries(OPTIONAL_ENV_VARS)) {
    if (!process.env[key]) {
      warnings.push({ key, description });
    }
  }

  // If any required variables are missing, validation fails
  if (missing.length > 0) {
    const errorMessage = [
      'Missing required environment variables:',
      ...missing.map(({ key, description }) => `  - ${key}: ${description}`)
    ].join('\n');

    console.error('\n' + '='.repeat(80));
    console.error('ENVIRONMENT CONFIGURATION ERROR');
    console.error('='.repeat(80));
    console.error(errorMessage);
    console.error('\nPlease check your .env.local file and ensure all required variables are set.');
    console.error('See .env.example for a template.\n');
    console.error('='.repeat(80) + '\n');

    return {
      valid: false,
      error: errorMessage,
      missing: missing.map(m => m.key),
      warnings: warnings.map(w => w.key),
    };
  }

  // Log warnings for optional variables (but don't fail validation)
  if (warnings.length > 0 && process.env.NODE_ENV === 'development') {
    console.warn('\nOptional environment variables not set:');
    warnings.forEach(({ key, description }) => {
      console.warn(`  - ${key}: ${description}`);
    });
    console.warn('');
  }

  return {
    valid: true,
    missing: [],
    warnings: warnings.map(w => w.key),
  };
}

/**
 * Validates specific environment variables (subset of required vars)
 * Useful when an API route only needs certain credentials
 *
 * @param {Array<string>} requiredVars - Array of environment variable names to check
 * @returns {Object} Validation result (same structure as validateEnvironment)
 */
export function validateSpecificVars(requiredVars) {
  const missing = [];

  for (const key of requiredVars) {
    if (!process.env[key]) {
      const description = REQUIRED_ENV_VARS[key] || OPTIONAL_ENV_VARS[key] || 'Environment variable';
      missing.push({ key, description });
    }
  }

  if (missing.length > 0) {
    const errorMessage = [
      'Missing required environment variables for this operation:',
      ...missing.map(({ key, description }) => `  - ${key}: ${description}`)
    ].join('\n');

    console.error(errorMessage);

    return {
      valid: false,
      error: errorMessage,
      missing: missing.map(m => m.key),
    };
  }

  return { valid: true, missing: [] };
}

/**
 * Creates a standardized error response for API routes
 * Returns different levels of detail based on environment (dev vs production)
 *
 * @param {Object} validationResult - Result from validateEnvironment()
 * @returns {Object} Error response object suitable for NextResponse.json()
 */
export function getValidationErrorResponse(validationResult) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  return {
    error: 'Server Configuration Error',
    message: isDevelopment
      ? 'Required environment variables are not set. Check server logs for details.'
      : 'The server is not properly configured. Please contact the administrator.',

    // Only include technical details in development mode
    ...(isDevelopment && {
      details: validationResult.error,
      missing: validationResult.missing,
      hint: 'Check your .env.local file and compare with .env.example',
    }),
  };
}

/**
 * Middleware-style validator for API routes
 * Can be used to wrap API route handlers
 *
 * Example:
 *   export async function POST(request) {
 *     return withEnvValidation(() => {
 *       // Your actual route handler code
 *     });
 *   }
 *
 * @param {Function} handler - The API route handler function
 * @param {Array<string>} requiredVars - Optional: specific vars to validate (defaults to all)
 * @returns {Promise} Handler result or error response
 */
export async function withEnvValidation(handler, requiredVars = null) {
  const validation = requiredVars
    ? validateSpecificVars(requiredVars)
    : validateEnvironment();

  if (!validation.valid) {
    const { NextResponse } = await import('next/server');
    return NextResponse.json(
      getValidationErrorResponse(validation),
      { status: 500 }
    );
  }

  return handler();
}

/**
 * Validates environment on module load (for immediate feedback during development)
 * Only runs in development mode to avoid impacting production cold starts
 */
if (process.env.NODE_ENV === 'development') {
  // Don't validate during build time (Next.js runs this during build)
  if (process.env.NEXT_PHASE !== 'phase-production-build') {
    const result = validateEnvironment();
    if (!result.valid && typeof window === 'undefined') {
      // Only show in server context (not in browser)
      console.error('\n⚠️  Environment validation failed on module load');
      console.error('Some API routes may not work correctly.\n');
    }
  }
}
