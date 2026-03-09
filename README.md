![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/sandschi/StreamCast-Pro?utm_source=oss&utm_medium=github&utm_campaign=sandschi%2FStreamCast-Pro&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)
[![Node.js CI](https://github.com/sandschi/StreamCast-Pro/actions/workflows/node.js.yml/badge.svg)](https://github.com/sandschi/StreamCast-Pro/actions/workflows/node.js.yml)
[![Uptime](https://kuma.sandschi.xyz/api/badge/19/status?style=for-the-badge)](https://overlay.sandschi.xyz/)

# StreamCast Pro

StreamCast Pro is a professional-grade Next.js application designed to enhance live streaming experiences with interactive overlays, automated chatbot features, and KaraFun integration. Originally built for Twitch broadcasters, it provides real-time chat displays, dynamic karaoke song queues, and secure broadcaster management dashboards.

## ✨ Features

- **Twitch Chat Overlay**: Beautiful, customizable real-time Twitch chat overlays using `tmi.js`.
- **KaraFun Integration**: Connects with KaraFun to seamlessly display "Now Playing" popups and upcoming song queues directly on stream.
- **Broadcaster Dashboard**: Secure backend for managing stream settings, overlay URLs, and Mod Links.
- **Real-time Configuration**: Uses Firebase Firestore and Realtime Database for instant overlay updates without requiring browser refreshes in OBS.
- **Discord Notifications**: Automated webhook alerts for newly registered broadcasters awaiting approval.
- **Telemetry & Analytics**: Comprehensive frontend and backend usage tracking via PostHog, safely wrapped to protect API performance.

## 🛠️ Technology Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) & [Framer Motion](https://www.framer.com/motion/) for animations
- **Database & Auth**: [Firebase v12](https://firebase.google.com/) (Client & Admin SDKs)
- **Twitch Connection**: `tmi.js`
- **Analytics**: `posthog-js` & `posthog-node`

## 🚀 Getting Started

### Prerequisites
Node.js (v18+) and `npm`, `yarn`, or `pnpm`.

### Installation
Clone the repository and install dependencies:
```bash
npm install
```

### Environment Variables
Create a `.env.local` file in the root directory. You will need to provide the following keys to use all features:

```env
# Firebase Client (Public)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Firebase Admin (Secret)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYourKeyHere\n-----END PRIVATE KEY-----\n"

# API & Telemetry (Secret)
DISCORD_WEBHOOK_URL=your_discord_webhook_url
NEXT_PUBLIC_POSTHOG_KEY=your_posthog_key
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

### Running Locally
Run the development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 🔒 Security
- All sensitive keys (like `FIREBASE_PRIVATE_KEY`) are kept fully server-side within the Next.js API Routes.
- API endpoints are securely gated using a combination of Firebase Authentication and secure Token verification utilizing `crypto.timingSafeEqual`.
- Application gracefully degrades functionality (returning 404s/503s) if third-party hooks are offline.
