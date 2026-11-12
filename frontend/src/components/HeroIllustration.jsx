import React from 'react';

/**
 * HeroIllustration: Enterprise vector graphic for the Login page.
 * Depicts a glossy laptop on a glowing circular platform with two concentric rings,
 * surrounded by 5 floating glass tiles connected by smooth curved dashed arcs:
 * 1. Database (top)
 * 2. Gear (left)
 * 3. Shopping Cart (right)
 * 4. Bar Chart (lower left)
 * 5. Clipboard Checklist (lower right)
 *
 * Built strictly with inline SVG vectors, design tokens, and zero external image/raster assets.
 */
export default function HeroIllustration({ className = '' }) {
  return (
    <div className={`lg-illustration-wrap ${className}`.trim()} aria-hidden="true">
      <svg
        className="lg-hero-svg"
        viewBox="0 0 560 410"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        role="presentation"
      >
        <defs>
          {/* Ambient Glow Blur Filter */}
          <filter id="lg-glow-blur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="12" result="blur" />
          </filter>

          {/* Soft Glass Tile Drop Shadow */}
          <filter id="lg-tile-shadow" x="-30%" y="-25%" width="160%" height="160%">
            <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#001838" floodOpacity="0.38" />
          </filter>

          {/* Circular Platform Glow Underneath */}
          <radialGradient id="lg-platform-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#6699B8" stopOpacity="0.55" />
            <stop offset="55%" stopColor="#02579A" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#00204E" stopOpacity="0" />
          </radialGradient>

          {/* Platform Upper Surface Gradient */}
          <linearGradient id="lg-platform-surface" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.32" />
            <stop offset="45%" stopColor="#B3CDE0" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#02579A" stopOpacity="0.4" />
          </linearGradient>

          {/* Glass Tile Fill Gradient */}
          <linearGradient id="lg-glass-tile-fill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.32" />
            <stop offset="45%" stopColor="#B3CDE0" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#02579A" stopOpacity="0.24" />
          </linearGradient>

          {/* Laptop Lid Light Edge Highlight */}
          <linearGradient id="lg-laptop-light-edge" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#B3CDE0" stopOpacity="0.75" />
            <stop offset="25%" stopColor="#FFFFFF" stopOpacity="0.95" />
            <stop offset="75%" stopColor="#FFFFFF" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#B3CDE0" stopOpacity="0.75" />
          </linearGradient>

          {/* Laptop Chassis Metallic Gradient */}
          <linearGradient id="lg-laptop-chassis" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#08315E" />
            <stop offset="100%" stopColor="#00142E" />
          </linearGradient>

          {/* Laptop Bezel Deep Navy Gradient */}
          <linearGradient id="lg-laptop-bezel" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0A335E" />
            <stop offset="100%" stopColor="#011833" />
          </linearGradient>

          {/* Vibrant Screen Background Gradient */}
          <linearGradient id="lg-screen-bg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#053366" />
            <stop offset="100%" stopColor="#021C3B" />
          </linearGradient>

          {/* Glossy Screen Diagonal Reflection */}
          <linearGradient id="lg-screen-gloss" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.18" />
            <stop offset="45%" stopColor="#FFFFFF" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>

          {/* Laptop Base Lip Highlight */}
          <linearGradient id="lg-lip-highlight" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6699B8" stopOpacity="0.6" />
            <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#6699B8" stopOpacity="0.6" />
          </linearGradient>

          {/* Wave Gradients at Base */}
          <linearGradient id="lg-wave-1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6699B8" stopOpacity="0" />
            <stop offset="50%" stopColor="#6699B8" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#B3CDE0" stopOpacity="0" />
          </linearGradient>

          <linearGradient id="lg-wave-2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#B3CDE0" stopOpacity="0" />
            <stop offset="50%" stopColor="#B3CDE0" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#02579A" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* ---------------- 1. SUBTLE WAVE SHAPES AT BASE ---------------- */}
        <g className="lg-hero-waves">
          <path
            d="M 0 380 C 140 360, 260 390, 400 372 C 460 365, 510 376, 560 370 L 560 410 L 0 410 Z"
            fill="url(#lg-wave-1)"
          />
          <path
            d="M 0 392 C 120 402, 290 376, 420 392 C 480 398, 520 388, 560 386 L 560 410 L 0 410 Z"
            fill="url(#lg-wave-2)"
          />
        </g>

        {/* ---------------- 2. GLOWING CIRCULAR PLATFORM ---------------- */}
        <g className="lg-hero-platform">
          {/* Ambient Soft Under-glow */}
          <ellipse cx="280" cy="276" rx="190" ry="50" fill="url(#lg-platform-glow)" filter="url(#lg-glow-blur)" />

          {/* Platform 3D Rim / Drop */}
          <path
            d="M 105 276 C 105 304, 455 304, 455 276 L 455 284 C 455 312, 105 312, 105 284 Z"
            fill="rgba(2, 87, 154, 0.45)"
            stroke="rgba(179, 205, 224, 0.3)"
            strokeWidth="1"
          />

          {/* Platform Upper Surface */}
          <ellipse
            cx="280"
            cy="276"
            rx="175"
            ry="38"
            fill="url(#lg-platform-surface)"
            stroke="#B3CDE0"
            strokeWidth="1.5"
            strokeOpacity="0.75"
          />

          {/* Concentric Ring 1 (Outer) */}
          <ellipse
            cx="280"
            cy="276"
            rx="146"
            ry="30"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="1.4"
            strokeOpacity="0.7"
            strokeDasharray="8 5"
          />

          {/* Concentric Ring 2 (Inner) */}
          <ellipse
            cx="280"
            cy="276"
            rx="116"
            ry="22"
            fill="none"
            stroke="#B3CDE0"
            strokeWidth="1.2"
            strokeOpacity="0.8"
            strokeDasharray="5 4"
          />

          {/* Soft Shadow directly under Laptop */}
          <ellipse cx="280" cy="276" rx="115" ry="16" fill="#00142E" opacity="0.7" filter="url(#lg-glow-blur)" />
        </g>

        {/* ---------------- 3. SMOOTH CURVED DASHED ARCS ---------------- */}
        <g className="lg-hero-arcs">
          {/* Top Arc: Database to Laptop Screen Top Bezel */}
          <path
            className="lg-hero-arc lg-hero-arc-top"
            d="M 280 76 L 280 108"
            stroke="#B3CDE0"
            strokeWidth="1.2"
            strokeDasharray="4 4"
            strokeOpacity="0.6"
            fill="none"
          />

          {/* Left Arc: Gear to Left Screen Bezel */}
          <path
            className="lg-hero-arc lg-hero-arc-left"
            d="M 96 140 C 130 140, 145 156, 175 160"
            stroke="#B3CDE0"
            strokeWidth="1.2"
            strokeDasharray="4 4"
            strokeOpacity="0.6"
            fill="none"
          />

          {/* Right Arc: Shopping Cart to Right Screen Bezel */}
          <path
            className="lg-hero-arc lg-hero-arc-right"
            d="M 464 140 C 430 140, 415 156, 385 160"
            stroke="#B3CDE0"
            strokeWidth="1.2"
            strokeDasharray="4 4"
            strokeOpacity="0.6"
            fill="none"
          />

          {/* Lower Left Arc: Bar Chart to Laptop Base Left */}
          <path
            className="lg-hero-arc lg-hero-arc-lower-left"
            d="M 104 256 C 128 256, 142 260, 160 262"
            stroke="#B3CDE0"
            strokeWidth="1.2"
            strokeDasharray="4 4"
            strokeOpacity="0.6"
            fill="none"
          />

          {/* Lower Right Arc: Clipboard Checklist to Laptop Base Right */}
          <path
            className="lg-hero-arc lg-hero-arc-lower-right"
            d="M 456 256 C 432 256, 418 260, 400 262"
            stroke="#B3CDE0"
            strokeWidth="1.2"
            strokeDasharray="4 4"
            strokeOpacity="0.6"
            fill="none"
          />
        </g>

        {/* ---------------- 4. GLOSSY LAPTOP ---------------- */}
        <g className="lg-hero-laptop">
          {/* Base Chassis Surface */}
          <polygon
            points="160,256 400,256 424,276 136,276"
            fill="url(#lg-laptop-chassis)"
            stroke="rgba(179, 205, 224, 0.6)"
            strokeWidth="1"
          />

          {/* Front Beveled Lip with Crisp Light Highlight */}
          <path
            d="M 136 276 L 424 276 L 424 280 L 136 280 Z"
            fill="url(#lg-lip-highlight)"
          />

          {/* Display Opening Notch */}
          <rect x="264" y="275" width="32" height="2.5" rx="1.25" fill="#FFFFFF" opacity="0.85" />

          {/* Trackpad Outline */}
          <polygon
            points="248,263 312,263 315,274 245,274"
            fill="rgba(255, 255, 255, 0.08)"
            stroke="rgba(179, 205, 224, 0.35)"
            strokeWidth="0.8"
          />

          {/* Keyboard Deck Well Shadow */}
          <polygon
            points="174,258 386,258 394,262 166,262"
            fill="rgba(0, 16, 40, 0.75)"
          />

          {/* Laptop Screen Lid with Visible Light Edge */}
          <rect
            x="175"
            y="108"
            width="210"
            height="148"
            rx="10"
            fill="url(#lg-laptop-bezel)"
            stroke="url(#lg-laptop-light-edge)"
            strokeWidth="1.5"
          />

          {/* Web Camera Lens Dot */}
          <circle cx="280" cy="115" r="1.8" fill="#FFFFFF" opacity="0.8" />

          {/* Inner Bright Enterprise Screen */}
          <rect
            x="185"
            y="122"
            width="190"
            height="124"
            rx="5"
            fill="url(#lg-screen-bg)"
          />

          {/* Top Window Header Bar */}
          <circle cx="194" cy="130" r="1.8" fill="rgba(255, 255, 255, 0.5)" />
          <circle cx="200" cy="130" r="1.8" fill="rgba(255, 255, 255, 0.5)" />
          <circle cx="206" cy="130" r="1.8" fill="rgba(255, 255, 255, 0.5)" />
          <rect x="217" y="127" width="58" height="6" rx="3" fill="rgba(255, 255, 255, 0.16)" />

          {/* Emerald Operational Badge (Top Right of Screen) */}
          <g>
            <rect
              x="315"
              y="125"
              width="52"
              height="10"
              rx="5"
              fill="rgba(16, 185, 129, 0.3)"
              stroke="#10B981"
              strokeWidth="0.9"
            />
            <circle cx="323" cy="130" r="2.5" fill="#34D399" />
            <path
              d="M 321.8 130 L 322.8 131.2 L 324.6 128.8"
              stroke="#FFFFFF"
              strokeWidth="0.85"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect x="329" y="128.5" width="32" height="3.5" rx="1.75" fill="#FFFFFF" opacity="0.95" />
          </g>

          {/* Screen Content - Left: BOM Tree Hierarchy */}
          <g>
            {/* Parent Node */}
            <rect
              x="193"
              y="142"
              width="44"
              height="14"
              rx="3"
              fill="#02579A"
              stroke="#B3CDE0"
              strokeWidth="0.85"
            />
            <rect x="198" y="147" width="34" height="4" rx="2" fill="#FFFFFF" opacity="0.95" />

            {/* Tree Branch Connectors */}
            <path
              d="M 215 156 L 215 164 M 202 164 L 228 164 M 202 164 L 202 170 M 228 164 L 228 170"
              stroke="#B3CDE0"
              strokeWidth="1.2"
              strokeOpacity="0.85"
              fill="none"
            />

            {/* Child Node 1 */}
            <rect
              x="191"
              y="170"
              width="23"
              height="12"
              rx="2.5"
              fill="rgba(2, 87, 154, 0.65)"
              stroke="#B3CDE0"
              strokeWidth="0.75"
            />
            <rect x="195" y="174.5" width="15" height="3" rx="1.5" fill="#FFFFFF" opacity="0.85" />

            {/* Child Node 2 */}
            <rect
              x="219"
              y="170"
              width="23"
              height="12"
              rx="2.5"
              fill="rgba(2, 87, 154, 0.65)"
              stroke="#B3CDE0"
              strokeWidth="0.75"
            />
            <rect x="223" y="174.5" width="15" height="3" rx="1.5" fill="#FFFFFF" opacity="0.85" />
          </g>

          {/* Screen Content - Right: Enterprise Data Rows */}
          <g>
            {/* Header row */}
            <rect x="252" y="142" width="115" height="9" rx="2" fill="rgba(179, 205, 224, 0.3)" />

            {/* Row 1 */}
            <rect x="252" y="155" width="115" height="8" rx="2" fill="rgba(255, 255, 255, 0.1)" />
            <circle cx="257" cy="159" r="1.6" fill="#34D399" />
            <rect x="262" y="157" width="38" height="4" rx="1.5" fill="#FFFFFF" opacity="0.85" />
            <rect x="306" y="157" width="26" height="4" rx="1.5" fill="rgba(255, 255, 255, 0.5)" />
            <rect x="338" y="157" width="24" height="4" rx="1.5" fill="rgba(255, 255, 255, 0.5)" />

            {/* Row 2 */}
            <rect x="252" y="167" width="115" height="8" rx="2" fill="rgba(255, 255, 255, 0.07)" />
            <circle cx="257" cy="171" r="1.6" fill="#34D399" />
            <rect x="262" y="169" width="32" height="4" rx="1.5" fill="#FFFFFF" opacity="0.85" />
            <rect x="300" y="169" width="30" height="4" rx="1.5" fill="rgba(255, 255, 255, 0.5)" />
            <rect x="336" y="169" width="26" height="4" rx="1.5" fill="rgba(255, 255, 255, 0.5)" />

            {/* Row 3 */}
            <rect x="252" y="179" width="115" height="8" rx="2" fill="rgba(255, 255, 255, 0.1)" />
            <circle cx="257" cy="183" r="1.6" fill="#34D399" />
            <rect x="262" y="181" width="36" height="4" rx="1.5" fill="#FFFFFF" opacity="0.85" />
            <rect x="304" y="181" width="24" height="4" rx="1.5" fill="rgba(255, 255, 255, 0.5)" />
            <rect x="334" y="181" width="28" height="4" rx="1.5" fill="rgba(255, 255, 255, 0.5)" />

            {/* Lower Summary Data Strip */}
            <rect
              x="193"
              y="194"
              width="174"
              height="9"
              rx="2.5"
              fill="rgba(2, 87, 154, 0.35)"
              stroke="rgba(179, 205, 224, 0.3)"
              strokeWidth="0.6"
            />
            <rect x="200" y="197" width="60" height="3" rx="1.5" fill="#FFFFFF" opacity="0.8" />
            <rect x="300" y="197" width="60" height="3" rx="1.5" fill="#34D399" opacity="0.9" />
          </g>

          {/* Lower Chart Trend Sparkline */}
          <path
            d="M 194 228 L 212 218 L 230 222 L 250 212 L 270 217 L 290 206 L 310 213 L 330 205 L 350 210 L 366 204"
            fill="none"
            stroke="#6699B8"
            strokeWidth="1.5"
            opacity="0.75"
          />

          {/* Diagonal Gloss Reflection Sweep */}
          <path d="M 185 122 L 305 122 L 185 246 Z" fill="url(#lg-screen-gloss)" />
        </g>

        {/* ---------------- 5. FIVE FLOATING GLASS TILES (1.4x LARGER) ---------------- */}
        {/* Tile 1: Database (Top) */}
        <g className="lg-hero-tile lg-hero-tile-top" data-testid="lg-tile-database">
          <rect
            x="248"
            y="12"
            width="64"
            height="64"
            rx="15"
            fill="url(#lg-glass-tile-fill)"
            stroke="rgba(255, 255, 255, 0.65)"
            strokeWidth="1"
            filter="url(#lg-tile-shadow)"
          />
          {/* Subtle Top Edge Highlight Line */}
          <path d="M 260 13.5 H 300" stroke="#FFFFFF" strokeWidth="1.2" strokeOpacity="0.85" strokeLinecap="round" />
          {/* Inner Light Border */}
          <rect x="249" y="13" width="62" height="62" rx="14" stroke="rgba(255, 255, 255, 0.22)" strokeWidth="0.8" fill="none" />
          {/* Database Icon - Thicker White Strokes */}
          <ellipse cx="280" cy="32" rx="14" ry="5" fill="none" stroke="#FFFFFF" strokeWidth="2.4" />
          <path
            d="M 266 32 v 8 c 0 2.8 6.2 5 14 5 s 14 -2.2 14 -5 v -8"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.4"
          />
          <path
            d="M 266 40 v 8 c 0 2.8 6.2 5 14 5 s 14 -2.2 14 -5 v -8"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.4"
          />
        </g>

        {/* Tile 2: Gear (Left) */}
        <g className="lg-hero-tile lg-hero-tile-left" data-testid="lg-tile-gear">
          <rect
            x="32"
            y="108"
            width="64"
            height="64"
            rx="15"
            fill="url(#lg-glass-tile-fill)"
            stroke="rgba(255, 255, 255, 0.65)"
            strokeWidth="1"
            filter="url(#lg-tile-shadow)"
          />
          <path d="M 44 109.5 H 84" stroke="#FFFFFF" strokeWidth="1.2" strokeOpacity="0.85" strokeLinecap="round" />
          <rect x="33" y="109" width="62" height="62" rx="14" stroke="rgba(255, 255, 255, 0.22)" strokeWidth="0.8" fill="none" />
          {/* Gear / Cog Icon - Thicker White Strokes */}
          <circle cx="64" cy="140" r="5.5" fill="none" stroke="#FFFFFF" strokeWidth="2.4" />
          <path
            d="M 61.5 128 h 5 l 1.1 3.2 l 3.2 0.8 l 2.4 -2.2 l 3.6 3.6 l -2.2 2.4 l 0.8 3.2 l 3.2 1.1 v 5 l -3.2 1.1 l -0.8 3.2 l 2.2 2.4 l -3.6 3.6 l -2.4 -2.2 l -3.2 0.8 l -1.1 3.2 h -5 l -1.1 -3.2 l -3.2 -0.8 l -2.4 2.2 l -3.6 -3.6 l 2.2 -2.4 l -0.8 -3.2 l -3.2 -1.1 v -5 l 3.2 -1.1 l 0.8 -3.2 l -2.2 -2.4 l 3.6 -3.6 l 2.4 2.2 l 3.2 -0.8 Z"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
        </g>

        {/* Tile 3: Shopping Cart (Right) */}
        <g className="lg-hero-tile lg-hero-tile-right" data-testid="lg-tile-cart">
          <rect
            x="464"
            y="108"
            width="64"
            height="64"
            rx="15"
            fill="url(#lg-glass-tile-fill)"
            stroke="rgba(255, 255, 255, 0.65)"
            strokeWidth="1"
            filter="url(#lg-tile-shadow)"
          />
          <path d="M 476 109.5 H 516" stroke="#FFFFFF" strokeWidth="1.2" strokeOpacity="0.85" strokeLinecap="round" />
          <rect x="465" y="109" width="62" height="62" rx="14" stroke="rgba(255, 255, 255, 0.22)" strokeWidth="0.8" fill="none" />
          {/* Shopping Cart Icon - Thicker White Strokes */}
          <path
            d="M 482 129 h 4 l 3.5 15 h 16 l 3.2 -9.5 h -20"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="492" cy="150" r="2.4" fill="#FFFFFF" />
          <circle cx="503" cy="150" r="2.4" fill="#FFFFFF" />
        </g>

        {/* Tile 4: Bar Chart (Lower Left) */}
        <g className="lg-hero-tile lg-hero-tile-lower-left" data-testid="lg-tile-barchart">
          <rect
            x="40"
            y="228"
            width="64"
            height="64"
            rx="15"
            fill="url(#lg-glass-tile-fill)"
            stroke="rgba(255, 255, 255, 0.65)"
            strokeWidth="1"
            filter="url(#lg-tile-shadow)"
          />
          <path d="M 52 229.5 H 92" stroke="#FFFFFF" strokeWidth="1.2" strokeOpacity="0.85" strokeLinecap="round" />
          <rect x="41" y="229" width="62" height="62" rx="14" stroke="rgba(255, 255, 255, 0.22)" strokeWidth="0.8" fill="none" />
          {/* Bar Chart Icon - Thicker White Strokes */}
          <path
            d="M 58 274 H 84 M 58 274 V 246"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="62" y="264" width="4.5" height="10" rx="1" fill="#FFFFFF" />
          <rect x="69" y="255" width="4.5" height="19" rx="1" fill="#FFFFFF" />
          <rect x="76" y="248" width="4.5" height="26" rx="1" fill="#FFFFFF" />
        </g>

        {/* Tile 5: Clipboard Checklist (Lower Right) */}
        <g className="lg-hero-tile lg-hero-tile-lower-right" data-testid="lg-tile-clipboard">
          <rect
            x="456"
            y="228"
            width="64"
            height="64"
            rx="15"
            fill="url(#lg-glass-tile-fill)"
            stroke="rgba(255, 255, 255, 0.65)"
            strokeWidth="1"
            filter="url(#lg-tile-shadow)"
          />
          <path d="M 468 229.5 H 508" stroke="#FFFFFF" strokeWidth="1.2" strokeOpacity="0.85" strokeLinecap="round" />
          <rect x="457" y="229" width="62" height="62" rx="14" stroke="rgba(255, 255, 255, 0.22)" strokeWidth="0.8" fill="none" />
          {/* Clipboard Checklist Icon - Thicker White Strokes */}
          <rect x="477" y="246" width="22" height="28" rx="3.5" fill="none" stroke="#FFFFFF" strokeWidth="2.4" />
          <path d="M 484 246 v -3.5 h 8 v 3.5" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
          {/* Checklist Item 1 */}
          <path
            d="M 481 258 l 2 2 l 4 -4"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1="490" y1="258" x2="495" y2="258" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
          {/* Checklist Item 2 */}
          <path
            d="M 481 266 l 2 2 l 4 -4"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1="490" y1="266" x2="495" y2="266" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}
