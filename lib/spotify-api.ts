// Spotify API wrapper with rate limit handling
// Implements exponential backoff and retry logic for 429 errors

interface SpotifyFetchOptions extends RequestInit {
  maxRetries?: number;
  baseDelay?: number;
}

/**
 * Fetch wrapper for Spotify API with automatic rate limit handling
 * Retries on 429 errors with exponential backoff
 */
export async function spotifyFetch(
  url: string,
  accessToken: string,
  options: SpotifyFetchOptions = {}
): Promise<Response> {
  const { maxRetries = 3, baseDelay = 1000, ...fetchOptions } = options;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    ...fetchOptions.headers,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
      });

      // If rate limited, wait and retry
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : baseDelay * Math.pow(2, attempt);

        console.warn(`⚠️ Rate limited (429). Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}...`);

        if (attempt < maxRetries) {
          await sleep(waitTime);
          continue;
        }
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Spotify fetch error (attempt ${attempt + 1}):`, error);

      if (attempt < maxRetries) {
        await sleep(baseDelay * Math.pow(2, attempt));
      }
    }
  }

  throw lastError || new Error('Spotify fetch failed after all retries');
}

/**
 * Batch fetch with rate limiting
 * Processes items in batches with delays between batches
 */
export async function batchSpotifyFetch<T, R>(
  items: T[],
  batchSize: number,
  delayBetweenBatches: number,
  fetchFn: (batch: T[]) => Promise<R[]>
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await fetchFn(batch);
    results.push(...batchResults);

    // Delay between batches to avoid rate limits
    if (i + batchSize < items.length) {
      await sleep(delayBetweenBatches);
    }
  }

  return results;
}

/**
 * Get audio features for multiple tracks with rate limiting
 */
export async function getAudioFeaturesBatch(
  trackIds: string[],
  accessToken: string
): Promise<Map<string, any>> {
  const features = new Map<string, any>();

  // Spotify allows max 100 tracks per request
  const batchSize = 100;
  const delayMs = 100; // 100ms between batches

  for (let i = 0; i < trackIds.length; i += batchSize) {
    const batch = trackIds.slice(i, i + batchSize);
    const ids = batch.join(',');

    try {
      const response = await spotifyFetch(
        `https://api.spotify.com/v1/audio-features?ids=${ids}`,
        accessToken,
        { maxRetries: 2, baseDelay: 500 }
      );

      if (response.ok) {
        const data = await response.json();
        (data.audio_features || []).forEach((f: any, idx: number) => {
          if (f) {
            features.set(batch[idx], f);
          }
        });
      }
    } catch (error) {
      console.error('Audio features batch error:', error);
    }

    // Delay between batches
    if (i + batchSize < trackIds.length) {
      await sleep(delayMs);
    }
  }

  return features;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if we're likely rate limited and should back off
 */
export function shouldBackOff(errorCount: number, threshold: number = 3): boolean {
  return errorCount >= threshold;
}

/**
 * Calculate backoff time based on error count
 */
export function calculateBackoff(errorCount: number, baseMs: number = 1000, maxMs: number = 30000): number {
  const backoff = Math.min(baseMs * Math.pow(2, errorCount), maxMs);
  // Add jitter to prevent thundering herd
  return backoff + Math.random() * 1000;
}
