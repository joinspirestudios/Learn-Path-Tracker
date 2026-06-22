// Aurora mobile theme — React Native-safe theme object.
//
// This mirrors the Aurora visual direction used by the web app, but is a
// plain JS object with no CSS imports and no DOM dependencies. It is the
// single source of visual tokens for the mobile skin.
//
// Direction rules (must not drift from the web brain):
//   - Indigo is the single primary action/progress accent.
//   - Green means proof / success / Strong tier.
//   - Purple means peak / Perfect tier.
//   - Coral red means danger / report.
//   - Gold is NOT a primary accent.
//   - No fake-social-proof or gamified-economy colors.

export const auroraColors = {
  surface: {
    canvas: '#15131C', // app background, deepest layer
    panel: '#1E1B26', // card and section backgrounds
    raised: '#27232F', // elevated surface above panel
    input: '#221E2B', // input field background
    overlay: 'rgba(0, 0, 0, 0.72)',
  },
  text: {
    primary: '#F2EFF7', // high-contrast near-white
    secondary: '#ABA3B8', // lavender-gray
    muted: '#958CA5', // readable muted lavender
    inverse: '#11140E', // dark text on green/purple fills
  },
  border: {
    subtle: 'rgba(242, 239, 247, 0.10)',
    strong: 'rgba(109, 93, 246, 0.42)',
    focus: '#9485FF',
  },
  accent: {
    progress: '#6D5DF6', // primary action / progress (Aurora indigo)
    active: '#9485FF', // soft violet active state
    proof: '#2ED06E', // proof / success / Strong tier (green)
    success: '#2ED06E',
    warning: '#F0B84A',
    danger: '#FB5B5B', // danger / report (coral red)
    peak: '#B15CF6', // peak / Perfect tier (purple)
  },
};

export const auroraSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const auroraRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  card: 16,
  panel: 20,
  pill: 9999,
};

export const auroraLayout = {
  screenPadding: 20,
  cardPadding: 16,
  rowGap: 12,
  controlHeight: 48, // comfortable tap target
};

export const auroraTheme = {
  colors: auroraColors,
  spacing: auroraSpacing,
  radius: auroraRadius,
  layout: auroraLayout,
};

export default auroraTheme;
