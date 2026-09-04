import localFont from "next/font/local";

// Display face — logotypes, marketing headlines and big stat numerals only.
// Never body/nav/buttons/labels. See Designsystem/HANDOFF.md section 1.
// Defined here (not inline in layout.js) so both layout.js and any page that
// needs the resolved font-family string directly (see src/app/page.js) share
// a single font instance instead of next/font creating two.
export const pressStart2P = localFont({
    src: "../app/fonts/PressStart2P-Regular.ttf",
    variable: "--font-press-start-2p",
    weight: "400",
    display: "swap",
});
