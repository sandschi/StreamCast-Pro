# Design System: StreamCast Pro (Geist-Zinc Edition)
**Project ID:** 10019160937414043007

## 1. Visual Theme & Atmosphere: Sleek Dark Glass
The design system for StreamCast Pro follows a **"Premium Dark Glass"** aesthetic—utilizing deep zinc tones, high-fidelity backdrop blurs, and vibrant neon green accents. It prioritizes a modern, sleek feel that is professional yet approachable for streamers. Hierarchy is defined through transparency and subtle tonal shifts rather than rigid borders.

## 2. Color Palette & Surface Logic
*   **Void Black (#0a0a0a):** Primary backdrop (`bg-zinc-950`).
*   **Deep Glass (#18181b / 50% opacity):** Main surface color for containers with a `backdrop-blur-xl` effect.
*   **Neon Green (#07fc03):** The primary brand and interactive color. Used for buttons, status, and important highlights.
*   **Slate Border (#27272a / 50% opacity):** Very subtle borders (`border-zinc-800/50`) to separate glass panels.
## 3. Typography Rules
*   **Primary Typeface:** **Geist Sans**. Used for all UI headings, navigation, and body content. It provides a modern, geometric feel with high legibility.
*   **Technical Typeface:** **Geist Mono**. Reserved for technical data, Party IDs, and timestamps.
*   **Weight Usage:** Bold for section headers and primary actions; Medium for labels; Regular for body text.

## 4. Component Stylings
*   **Buttons:** Rectangular with generous rounding (`rounded-xl`). Primary buttons use solid Neon Green with inverted text. Secondary buttons use Zinc-800 backgrounds with Silver text.
*   **Cards/Containers:** Defined by 1px solid borders in `zinc-800` over a `zinc-900` background. No drop shadows; elevation is strictly tonal.
*   **Inputs:** `zinc-950` backgrounds (darker than the surface) with `zinc-800` borders. On focus, they use a 2px `primary-600` ring.

## 5. Layout Principles
*   **The Grid:** Sidebar-centric layout with a fluid main container. 
*   **Density:** Moderately high density with consistent 16px to 24px padding within modules.
*   **Separation:** Vertical and horizontal dividers are preferred over whitespace where clear structural boundaries are needed.

## 6. Page Map
*   **Dashboard (`/dashboard`)**: The central control hub. Contains tabs for Chat, History, Users, KaraFun, Settings, and Admin tools.
*   **Overlay (`/overlay/[userId]`)**: The broadcast-facing output. High-contrast, clean layout meant for OBS/Streaming software chroma keying or transparency.

## 7. Functional Requirements (Source of Truth)
### Chat & Moderation
*   **Live Connection**: Real-time TMI.js connection to Twitch.
*   **Manual Trigger**: Click "Show" to send message to overlay for a set duration.
*   **Permanent Trigger**: Click "Send ∞" to persist a message until manually hidden.
*   **Suggestions**: Viewer messages can be "Suggested" to moderators for approval.
*   **Role Management**: Granular control over who can act as a "Mod" or "Viewer" within the dashboard.

### KaraFun Integration
*   **Sync**: Real-time polling of KaraFun Party API.
*   **Queue Overlay**: Display next 5 songs with singer names.
*   **Now Playing Overlay**: Automated popup triggered by song state changes.
*   **Manual Controls**: Force-show or dismiss the Now Playing popup from the dashboard.

### Settings & Customization
*   **Visuals**: Live preview of bubble styles, colors, and fonts.
*   **Positioning**: 2D coordinate sliders (X, Y) for both Chat and KaraFun overlays.
*   **Audio**: Configurable notification sounds (Pop, Ding, etc.) with volume control.
