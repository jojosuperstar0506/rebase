import {
  Brain, Search, Flame, Palette, DollarSign, Package,
  Megaphone, PenLine, Users, Rocket, Zap, Gem,
  Activity,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Central map of the 12 GTM metric / index codes → lucide icons.
// Keep in sync with ciMocks.ts metric definitions (`icon` field).
// Falling back to Activity for any unmapped name keeps render sites
// safe from typos in mock data.
const METRIC_ICON_MAP: Record<string, LucideIcon> = {
  Mindshare: Brain,
  Keywords: Search,
  HotProducts: Flame,
  DesignDNA: Palette,
  Pricing: DollarSign,
  LaunchPace: Package,
  VoiceVolume: Megaphone,
  Content: PenLine,
  KOL: Users,
  Momentum: Rocket,
  Threat: Zap,
  PricePower: Gem,
};

export function MetricIcon({
  name, size = 18, color, strokeWidth = 1.75,
}: {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const Icon = METRIC_ICON_MAP[name] ?? Activity;
  return <Icon size={size} strokeWidth={strokeWidth} color={color} />;
}

export function getMetricIcon(name: string): LucideIcon {
  return METRIC_ICON_MAP[name] ?? Activity;
}
