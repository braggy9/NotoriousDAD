# Implementation Template - Environment Validation Pattern

This document shows how to implement the environment validation in your API routes when you build out the DJ Mix Generator features described in the PROJECT_STATUS_ANALYSIS.

## Example: Generate Mix Endpoint

```javascript
// app/api/generate-mix/route.js
import { NextResponse } from 'next/server';
import { validateEnvironment, getValidationErrorResponse } from '@/lib/envValidation';

export async function POST(request) {
  // ✅ STEP 1: Validate environment before any operations
  const envCheck = validateEnvironment();
  if (!envCheck.valid) {
    return NextResponse.json(
      getValidationErrorResponse(envCheck),
      { status: 500 }
    );
  }

  // ✅ STEP 2: Parse request body
  try {
    const body = await request.json();
    const { seedTracks, duration, energyLevel, userId } = body;

    // ✅ STEP 3: Your actual business logic here
    // - Get user's taste profile
    // - Generate playlist using Spotify API
    // - Review with Claude AI
    // - Save to database
    // - Return results

    return NextResponse.json({
      success: true,
      playlist: {
        // ... playlist data
      },
    });

  } catch (error) {
    console.error('Error generating mix:', error);
    return NextResponse.json(
      { error: 'Failed to generate mix', message: error.message },
      { status: 500 }
    );
  }
}
```

## Example: Review Playlist Endpoint (Claude AI)

```javascript
// app/api/review-playlist/route.js
import { NextResponse } from 'next/server';
import { validateSpecificVars, getValidationErrorResponse } from '@/lib/envValidation';

export async function POST(request) {
  // Only validate Anthropic API key for this endpoint
  const envCheck = validateSpecificVars(['ANTHROPIC_API_KEY']);

  if (!envCheck.valid) {
    // If API key is missing, return helpful error instead of silent fallback
    return NextResponse.json(
      getValidationErrorResponse(envCheck),
      { status: 500 }
    );
  }

  // Call Claude AI for review...
  // This prevents the "silent fallback to 75/100" issue mentioned in analysis
}
```

## Example: Database Operations

```javascript
// app/api/init-db/route.js
import { NextResponse } from 'next/server';
import { validateSpecificVars, getValidationErrorResponse } from '@/lib/envValidation';

export async function GET(request) {
  // Validate database credentials
  const envCheck = validateSpecificVars([
    'POSTGRES_URL',
    'POSTGRES_PRISMA_URL',
    'POSTGRES_URL_NON_POOLING',
  ]);

  if (!envCheck.valid) {
    return NextResponse.json(
      getValidationErrorResponse(envCheck),
      { status: 500 }
    );
  }

  // Initialize database tables...
}
```

## Using withEnvValidation Helper

For even cleaner code, use the wrapper function:

```javascript
import { withEnvValidation } from '@/lib/envValidation';

export async function POST(request) {
  return withEnvValidation(async () => {
    // Your route logic here
    // Environment is already validated
    const body = await request.json();
    // ...
  });
}

// Or validate specific variables:
export async function POST(request) {
  return withEnvValidation(async () => {
    // Your Spotify-only route logic
  }, ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET']);
}
```

## Benefits of This Pattern

1. **Early Failure Detection** - Catches missing config before operations start
2. **Helpful Error Messages** - Users see exactly what's missing (in dev mode)
3. **Prevents Silent Failures** - No more "fallback to 75/100" without warning
4. **Consistent Error Handling** - Same error format across all routes
5. **Environment-Aware** - Shows details in dev, generic messages in production

## Next Steps

When implementing the features from PROJECT_STATUS_ANALYSIS:

1. ✅ Install dependencies:
   ```bash
   npm install @anthropic-ai/sdk axios @vercel/postgres
   ```

2. ✅ Create lib files:
   - `lib/spotify.js` - Spotify API integration
   - `lib/claudeReview.js` - Claude AI reviews
   - `lib/sequencer.js` - Track ordering logic
   - `lib/db.js` - Database operations

3. ✅ Create API routes with validation:
   - `app/api/generate-mix/route.js`
   - `app/api/review-playlist/route.js`
   - `app/api/init-db/route.js`
   - `app/api/init-analytics/route.js`
   - All others from the analysis document

4. ✅ Always use environment validation in each route

This ensures you won't encounter the configuration issues identified in the analysis!
