export const Colors = {
  // Primary — Deep Teal (knowledge, prestige, discovery)
  primary: '#0D4F5C',
  primaryDark: '#083540',
  primaryLight: '#E0F2F5',
  primaryMuted: '#3D8A99',
  primaryGlow: 'rgba(13, 79, 92, 0.22)',

  // Accent 1 — Warm Amber/Gold (achievement, mentorship, warmth)
  accent: '#C98B30',
  accentLight: '#FDF3E3',
  accentGlow: 'rgba(201, 139, 48, 0.22)',

  // Accent 2 — Burnt Orange (energy, connection, human touch)
  accent2: '#B8491A',
  accent2Light: '#FAE9E0',
  accent2Glow: 'rgba(184, 73, 26, 0.20)',

  // Accent 3 — Sage Green (growth, learning, calm progress)
  accent3: '#3D7A5B',
  accent3Light: '#E8F5EE',
  accent3Glow: 'rgba(61, 122, 91, 0.20)',

  // Accent 4 — Dusty Indigo (creativity, depth — used sparingly)
  accent4: '#4A3B7C',
  accent4Light: '#EDEAF7',
  accent4Glow: 'rgba(74, 59, 124, 0.18)',

  // Semantic
  success: '#2B6A4A',
  successLight: '#E8F5EE',
  error: '#B83232',
  errorLight: '#FCEAEA',
  warning: '#D4870A',
  warningLight: '#FDF3E3',
  info: '#1D5FAB',

  // Neutrals — warm-toned (no cool-purple cast)
  dark: '#1A1410',
  gray900: '#2C2520',
  gray700: '#5C5248',
  gray500: '#8C8278',
  gray400: '#B0A89E',
  gray300: '#D4CEC8',
  gray200: '#EBE7E2',
  gray100: '#F5F2ED',
  white: '#FFFFFF',

  // Role-specific header
  mentorHeaderBg: '#3D2200',

  // Surfaces — warm parchment (not purple-tinted)
  background: '#FAF7F2',
  card: '#FFFFFF',
  cardElevated: '#FDFBF8',
  border: '#E5DED6',
  glass: 'rgba(255, 255, 255, 0.82)',
  glassBorder: 'rgba(255, 255, 255, 0.40)',
};

// Gradient presets — warm, editorial, multi-hued
export const Gradients = {
  primary: ['#0D4F5C', '#1A7A8A'] as const,
  primaryBold: ['#083540', '#0D4F5C'] as const,
  warm: ['#C98B30', '#E8A84A'] as const,
  terracotta: ['#B8491A', '#CC5A28'] as const,
  sage: ['#3D7A5B', '#5A9E7A'] as const,
  cool: ['#1D5FAB', '#0D4F5C'] as const,
  dark: ['#1A1410', '#2C2520'] as const,
  sunset: ['#B8491A', '#C98B30'] as const,
  hero: ['#083540', '#0D4F5C', '#1A7A8A'] as const,
  aurora: ['#0D4F5C', '#4A3B7C', '#C98B30'] as const,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const Radius = {
  xs: 2,
  sm: 4,
  md: 6,   // buttons — just enough to read as interactive
  lg: 8,
  xl: 10,
  xxl: 14,
  full: 999, // pills and badges only
};

// Font family constants — loaded via useFonts in app/_layout.tsx
export const Fonts = {
  serif: 'PlayfairDisplay_700Bold',
  serifBold: 'PlayfairDisplay_800ExtraBold',
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemiBold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
  script: 'GreatVibes_400Regular',
};

export const Typography = {
  // Display — Playfair Display serif (prestigious editorial headings)
  displayLg: { fontFamily: 'PlayfairDisplay_800ExtraBold', fontSize: 40, lineHeight: 48, letterSpacing: -0.8 },
  displayMd: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 30, lineHeight: 38, letterSpacing: -0.4 },
  displaySm: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 24, lineHeight: 32, letterSpacing: -0.2 },

  // Headings — Inter SemiBold/Bold
  headingLg: { fontFamily: 'Inter_700Bold', fontSize: 20, lineHeight: 28 },
  headingMd: { fontFamily: 'Inter_600SemiBold', fontSize: 18, lineHeight: 26 },
  headingSm: { fontFamily: 'Inter_600SemiBold', fontSize: 16, lineHeight: 24 },

  // Body — Inter Regular/Medium
  bodyLg: { fontFamily: 'Inter_400Regular', fontSize: 18, lineHeight: 28 },
  bodyMd: { fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 26 },
  bodySm: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },

  // Utility
  label: { fontFamily: 'Inter_700Bold', fontSize: 12, lineHeight: 16, letterSpacing: 1.4, textTransform: 'uppercase' as const },
  caption: { fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16 },

  // Script accent — Great Vibes (used sparingly: taglines, hero subtitle)
  script: { fontFamily: 'GreatVibes_400Regular', fontSize: 26, lineHeight: 36 },
};

export const Shadow = {
  sm: {
    shadowColor: '#1A1410',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: '#1A1410',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 16,
    elevation: 4,
  },
  lg: {
    shadowColor: '#1A1410',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 8,
  },
  glow: {
    // Gold glow — used on CTA buttons and achievement elements
    shadowColor: '#C98B30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 10,
  },
  teal: {
    // Teal glow — used on primary action elements
    shadowColor: '#0D4F5C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 6,
  },
};

export const FIELDS_OF_EXPERTISE = [
  'Computer Science', 'Engineering', 'Medicine', 'Law', 'Business',
  'Finance', 'Mathematics', 'Data Science', 'Artificial Intelligence',
  'Cybersecurity', 'Physics', 'Biology', 'Chemistry', 'Psychology',
  'Nursing', 'Architecture', 'Design', 'Marketing', 'Education',
  'Environmental Science', 'Political Science',
];

export const GRADE_LEVELS = [
  { value: 'high_school', label: 'High School' },
  { value: 'undergrad', label: 'Undergraduate' },
  { value: 'graduate', label: 'Graduate' },
  { value: 'phd', label: 'PhD' },
  { value: 'early_career', label: 'Early Career' },
  { value: 'professional', label: 'Professional' },
  { value: 'other', label: 'Other' },
];

export const AVAILABILITY_OPTIONS = [
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'mornings', label: 'Mornings' },
  { value: 'evenings', label: 'Evenings' },
];

export const FIELD_COLORS: Record<string, string> = {
  'Computer Science': '#0D4F5C',
  'Engineering': '#1D5FAB',
  'Medicine': '#B83232',
  'Law': '#4A3B7C',
  'Business': '#C98B30',
  'Finance': '#2B6A4A',
  'Mathematics': '#8B3A8B',
  'Data Science': '#0D4F5C',
  'Artificial Intelligence': '#4A3B7C',
  'Cybersecurity': '#B83232',
  'Physics': '#1D5FAB',
  'Biology': '#3D7A5B',
  'Chemistry': '#2B8A8A',
  'Psychology': '#B8491A',
  'Nursing': '#2B8A8A',
  'Architecture': '#8B5A2B',
  'Design': '#7C3B6A',
  'Marketing': '#B8491A',
  'Education': '#C98B30',
  'Environmental Science': '#3D7A5B',
  'Political Science': '#4A3B7C',
};
