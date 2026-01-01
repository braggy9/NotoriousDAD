# 🎧 DJ Mix Generator

An AI-powered playlist generator that creates seamless, beatmatched DJ mixes using Spotify's music library and Claude AI's advanced reasoning capabilities.

## ✨ Features

- **AI-Curated Playlists** - Claude AI analyzes your music taste and generates cohesive, flow-optimized playlists
- **Beatmatching & Harmonic Mixing** - Automatic BPM matching and key-compatible transitions
- **Learning System** - Improves recommendations based on your feedback over time
- **Reference Playlist Analysis** - Upload a playlist you love and get similar vibe recommendations
- **Track Replacement** - Don't like a track? Get intelligent replacements that maintain mix flow
- **Mixed In Key Integration** - Import professional DJ analysis for enhanced harmonic mixing
- **Quality Scoring** - AI-powered quality assessment of each generated mix

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Spotify Premium account
- Anthropic API key (for Claude AI)
- Vercel Postgres database (free tier available)

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd dj-mix-generator
npm install
```

### 2. Set Up Environment Variables

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your actual values:

#### Spotify API Credentials
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Copy your Client ID and Client Secret
4. Add `http://localhost:3000/api/auth/callback` to Redirect URIs
5. Update `.env.local` with these values

#### Anthropic API Key
1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Create an API key
3. Add it to `.env.local` as `ANTHROPIC_API_KEY`

#### Vercel Postgres
1. Create a Postgres database in [Vercel](https://vercel.com/storage/postgres)
2. Copy the connection strings from the `.env.local` tab in Vercel dashboard
3. Add all three `POSTGRES_URL` variants to your `.env.local`

#### NextAuth Secret
Generate a secure random secret:
```bash
openssl rand -base64 32
```
Add it to `.env.local` as `NEXTAUTH_SECRET`

### 3. Start the Development Server

```bash
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000)

### 4. Initialize the Database

**Important:** First-time setup requires database table initialization.

After starting the dev server, visit these URLs **once** (in order):

1. **Initialize core tables:**
   ```
   http://localhost:3000/api/init-db
   ```
   Creates tables for playlists, reviews, feedback, tracks, and taste profiles.

2. **Initialize analytics tables:**
   ```
   http://localhost:3000/api/init-analytics
   ```
   Creates tables for learning system (replacements, contexts, transitions).

You should see success messages. If you see "table already exists" errors, that's fine - tables are already set up.

### 5. Authenticate with Spotify

1. Visit [http://localhost:3000](http://localhost:3000)
2. Click "Login with Spotify"
3. Authorize the application
4. You're ready to generate mixes!

## 🎛️ Usage

### Generate Your First Mix

1. **Choose a seed method:**
   - **Liked Songs** - Uses your Spotify saved tracks
   - **Reference Playlist** - Paste a Spotify playlist URL to match its vibe
   - **Specific Tracks** - Select individual tracks as starting points

2. **Set preferences:**
   - Mix duration (30-120 minutes)
   - Energy level (chill, moderate, high energy)
   - Variety (focused or diverse)

3. **Click "Generate Mix"** and wait ~30-60 seconds

4. **Review the results:**
   - AI quality score and analysis
   - Track list with BPM/key information
   - Transition explanations

5. **Provide feedback:**
   - 👍 Loved it / 😐 It was okay / 👎 Didn't like it
   - The system learns from your feedback to improve future mixes

### Replace Individual Tracks

Don't like a specific track in your mix?

1. Click the **"Replace"** button next to any track
2. Get 3 intelligent replacement options that maintain mix flow
3. Select your preferred replacement
4. The system learns your preferences for future recommendations

### Mixed In Key Integration (Optional)

For professional DJs using Mixed In Key software:

1. Export your library analysis as CSV from Mixed In Key
2. Click **"Import MIK Data"** in the app
3. Upload your CSV file
4. Future mixes will use professional key/energy analysis instead of Spotify's estimates

## 🏗️ Project Structure

```
dj-mix-generator/
├── app/
│   ├── api/              # API routes (generate-mix, review-playlist, etc.)
│   ├── page.js           # Main UI
│   └── layout.js         # App layout
├── components/           # React components
├── lib/
│   ├── spotify.js        # Spotify API integration
│   ├── sequencer.js      # Track ordering and beatmatching logic
│   ├── claudeReview.js   # AI quality analysis
│   ├── tasteProfileBuilder.js  # User preference learning
│   ├── db.js             # Database operations
│   └── camelotWheel.js   # Harmonic mixing logic
├── .env.local            # Your environment variables (gitignored)
└── .env.example          # Template for environment setup
```

## 📊 How the Learning System Works

The app gets smarter over time by analyzing:

- **Feedback patterns** - Which types of playlists you rate highly
- **Track replacements** - Which tracks you swap out and why
- **Context preferences** - Your taste in different situations (workout, chill, party)
- **Transition quality** - Which BPM/key transitions work best for you

**Note:** You need to rate 5+ playlists before seeing meaningful learning insights.

## 🚀 Deployment

### Deploy to Vercel

1. Push your code to GitHub

2. Import to Vercel:
   ```bash
   vercel
   ```

3. Add environment variables in Vercel dashboard:
   - Go to Project Settings → Environment Variables
   - Add all variables from `.env.local` (except NEXTAUTH_URL - set this to your Vercel domain)

4. Add Vercel Postgres:
   - Storage → Create Database → Postgres
   - Vercel automatically adds the `POSTGRES_*` environment variables

5. Deploy:
   ```bash
   vercel --prod
   ```

6. Initialize database (production):
   Visit these URLs **once** after first deployment:
   - `https://your-app.vercel.app/api/init-db`
   - `https://your-app.vercel.app/api/init-analytics`

7. Update Spotify redirect URI:
   - In Spotify Developer Dashboard, add: `https://your-app.vercel.app/api/auth/callback`
   - Update `SPOTIFY_REDIRECT_URI` in Vercel environment variables

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (App Router)
- **AI:** Claude Sonnet 4.5 (Anthropic)
- **Music API:** Spotify Web API
- **Database:** Vercel Postgres (PostgreSQL)
- **Deployment:** Vercel (Serverless)
- **Styling:** Tailwind CSS

## 📚 Additional Documentation

- `ENHANCEMENTS_NOV_2025.md` - Recent updates and fixes
- `STRATEGIC_ROADMAP.md` - Feature roadmap and future plans
- `PHASE1_IMPLEMENTATION_SUMMARY.md` - Analytics system details
- `MIXED_IN_KEY_INTEGRATION.md` - Professional DJ features
- `PROJECT_STATUS_ANALYSIS_DEC_2025.md` - Comprehensive project analysis

## 🐛 Troubleshooting

### "Table does not exist" errors
- Make sure you've initialized the database by visiting `/api/init-db` and `/api/init-analytics`

### AI reviews showing generic 75/100 scores
- Check that `ANTHROPIC_API_KEY` is set correctly in your environment variables
- Verify your Anthropic API key is valid and has available credits

### Spotify authentication fails
- Ensure `SPOTIFY_REDIRECT_URI` matches exactly what's configured in Spotify Developer Dashboard
- Check that Client ID and Secret are correct

### Database connection errors
- Verify all three `POSTGRES_URL` variants are set
- Check that your database is accessible (not paused/suspended)

## 📝 License

MIT License - feel free to use this for personal or commercial projects!

## 🙏 Acknowledgments

- Spotify for their incredible music API
- Anthropic for Claude AI's music understanding capabilities
- Mixed In Key for professional DJ analysis standards
- The Next.js team for an amazing framework

---

**Built with ❤️ by DJs, for DJs**
