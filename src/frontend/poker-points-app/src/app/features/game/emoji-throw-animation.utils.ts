import {
  EmojiThrowProfile,
  EmojiThrownEvent,
  EGG_THROW_OPTION,
  getEmojiThrowOptionMetadata,
  POOP_THROW_OPTION,
  TOMATO_THROW_OPTION,
} from '../../core/models/session.models';

export const MAX_ACTIVE_EMOJI_ANIMATIONS = 20;
export const MAX_STUCK_DARTS = 28;
export const MAX_EMOJI_SPLATS = 16;
export const STUCK_DART_LIFETIME_MS = 3000;
export const EMOJI_SPLAT_LIFETIME_MS = 1150;
export const EMOJI_POP_CLEANUP_MS = 750;

export interface EmojiThrowPoint {
  x: number;
  y: number;
}

export interface EmojiThrowRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface EmojiTargetGeometry {
  center: EmojiThrowPoint;
  surfaceRect: EmojiThrowRect | null;
}

export type EmojiImpactSide = 'left' | 'right' | 'top' | 'bottom' | 'center';

export interface EmojiImpactPoint {
  point: EmojiThrowPoint;
  side: EmojiImpactSide;
}

export interface EmojiAnimation {
  id: string;
  emoji: string;
  senderDisplayName: string;
  profile: EmojiThrowProfile;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  horizontalArc: number;
  landingBounceX: number;
  landingBounceY: number;
  landingContinueX: number;
  landingContinueY: number;
  rotationDeg: number;
  stuckOffsetX: number;
  stuckOffsetY: number;
  stuckRotationDeg: number;
  flipY: 1 | -1;
  durationMs: number;
  mode: 'travel' | 'pop';
}

export type EmojiImpactSplatKind = 'poop' | 'tomato' | 'egg';

export interface EmojiImpactSplat {
  id: string;
  kind: EmojiImpactSplatKind;
  x: number;
  y: number;
  rotationDeg: number;
  scale: number;
}

interface EmojiAnimationProfileConfig {
  durationMs: number;
  cleanupBufferMs: number;
  arcMin: number;
  arcMax: number;
  arcDistanceScale: number;
  continueMin: number;
  continueMax: number;
  continueDistanceScale: number;
  bounceMin: number;
  bounceMax: number;
  sticksOnImpact: boolean;
}

const EMOJI_ANIMATION_PROFILES: Record<EmojiThrowProfile, EmojiAnimationProfileConfig> = {
  dart: {
    durationMs: 520,
    cleanupBufferMs: 160,
    arcMin: 8,
    arcMax: 24,
    arcDistanceScale: 0.04,
    continueMin: 44,
    continueMax: 72,
    continueDistanceScale: 0.18,
    bounceMin: 2,
    bounceMax: 7,
    sticksOnImpact: true,
  },
  airplane: {
    durationMs: 1200,
    cleanupBufferMs: 280,
    arcMin: 70,
    arcMax: 165,
    arcDistanceScale: 0.28,
    continueMin: 28,
    continueMax: 54,
    continueDistanceScale: 0.12,
    bounceMin: 16,
    bounceMax: 34,
    sticksOnImpact: false,
  },
  rock: {
    durationMs: 560,
    cleanupBufferMs: 520,
    arcMin: 12,
    arcMax: 36,
    arcDistanceScale: 0.06,
    continueMin: 58,
    continueMax: 96,
    continueDistanceScale: 0.24,
    bounceMin: 28,
    bounceMax: 48,
    sticksOnImpact: false,
  },
  default: {
    durationMs: 700,
    cleanupBufferMs: 400,
    arcMin: 44,
    arcMax: 115,
    arcDistanceScale: 0.18,
    continueMin: 36,
    continueMax: 64,
    continueDistanceScale: 0.16,
    bounceMin: 16,
    bounceMax: 30,
    sticksOnImpact: false,
  },
};

export function createEmojiAnimation(
  event: EmojiThrownEvent,
  targetGeometry: EmojiTargetGeometry,
  senderCenter: EmojiThrowPoint | null,
  reducedMotion: boolean,
  random: () => number = Math.random,
): EmojiAnimation {
  const profile = getEmojiThrowOptionMetadata(event.emoji)?.profile ?? 'default';
  const profileConfig = EMOJI_ANIMATION_PROFILES[profile];
  const mode = reducedMotion || !senderCenter ? 'pop' : 'travel';
  const startCenter = mode === 'travel' && senderCenter ? senderCenter : targetGeometry.center;
  const impact =
    mode === 'travel' && targetGeometry.surfaceRect
      ? getEmojiImpactPoint(startCenter, targetGeometry.surfaceRect)
      : { point: targetGeometry.center, side: 'center' as const };
  const stopsOnImpact =
    profileConfig.sticksOnImpact || getEmojiImpactSplatKind(event.emoji) !== null;
  const landingContinuation = stopsOnImpact
    ? { x: 0, y: 0 }
    : getEmojiLandingContinuation(startCenter, impact.point, impact.side, profileConfig);
  const landingBounce = stopsOnImpact
    ? { x: 0, y: 0 }
    : getEmojiLandingBounce(landingContinuation, impact.side, profileConfig, random);
  const stuckJitter = profile === 'dart' ? getDartStuckJitter(impact.side, random) : null;

  return {
    id: event.throwId,
    emoji: event.emoji,
    senderDisplayName: event.senderDisplayName,
    profile,
    fromX: startCenter.x,
    fromY: startCenter.y,
    toX: impact.point.x,
    toY: impact.point.y,
    horizontalArc: getEmojiHorizontalArc(startCenter, impact.point, profileConfig),
    landingBounceX: landingBounce.x,
    landingBounceY: landingBounce.y,
    landingContinueX: landingContinuation.x,
    landingContinueY: landingContinuation.y,
    rotationDeg: getEmojiRotationDeg(startCenter, impact.point),
    stuckOffsetX: stuckJitter?.x ?? 0,
    stuckOffsetY: stuckJitter?.y ?? 0,
    stuckRotationDeg: stuckJitter?.rotationDeg ?? 0,
    flipY: profile === 'airplane' && impact.point.x < startCenter.x ? -1 : 1,
    durationMs: mode === 'travel' ? profileConfig.durationMs : 400,
    mode,
  };
}

export function getEmojiAnimationStyle(animation: EmojiAnimation): string {
  return [
    `left: ${animation.fromX}px`,
    `top: ${animation.fromY}px`,
    `--e-dx: ${animation.toX - animation.fromX}px`,
    `--e-dy: ${animation.toY - animation.fromY}px`,
    `--e-arc: ${animation.horizontalArc}px`,
    `--e-bx: ${animation.landingBounceX}px`,
    `--e-by: ${animation.landingBounceY}px`,
    `--e-cx: ${animation.landingContinueX}px`,
    `--e-cy: ${animation.landingContinueY}px`,
    `--e-angle: ${animation.rotationDeg}deg`,
    `--e-flip-y: ${animation.flipY}`,
    `--e-duration: ${animation.durationMs}ms`,
  ].join('; ');
}

export function getEmojiStuckDartStyle(animation: EmojiAnimation): string {
  return [
    `left: ${animation.toX + animation.stuckOffsetX}px`,
    `top: ${animation.toY + animation.stuckOffsetY}px`,
    `--e-angle: ${animation.rotationDeg + animation.stuckRotationDeg}deg`,
    `--e-flip-y: ${animation.flipY}`,
  ].join('; ');
}

export function getEmojiImpactSplatKind(emoji: string): EmojiImpactSplatKind | null {
  switch (emoji) {
    case POOP_THROW_OPTION:
      return 'poop';
    case TOMATO_THROW_OPTION:
      return 'tomato';
    case EGG_THROW_OPTION:
      return 'egg';
    default:
      return null;
  }
}

export function createEmojiImpactSplat(
  animation: EmojiAnimation,
  kind: EmojiImpactSplatKind,
  random: () => number = Math.random,
): EmojiImpactSplat {
  return {
    id: animation.id,
    kind,
    x: animation.toX + (random() - 0.5) * 8,
    y: animation.toY + (random() - 0.5) * 8,
    rotationDeg: (random() - 0.5) * 34,
    scale: (kind === 'egg' ? 0.95 : 0.9) + random() * 0.25,
  };
}

export function getEmojiImpactSplatStyle(splat: EmojiImpactSplat): string {
  return [
    `left: ${splat.x}px`,
    `top: ${splat.y}px`,
    `--splat-rotation: ${splat.rotationDeg}deg`,
    `--splat-scale: ${splat.scale}`,
  ].join('; ');
}

export function createEmojiPoopSplat(
  animation: EmojiAnimation,
  random: () => number = Math.random,
): EmojiImpactSplat {
  return createEmojiImpactSplat(animation, 'poop', random);
}

export function getEmojiPoopSplatStyle(splat: EmojiImpactSplat): string {
  return getEmojiImpactSplatStyle(splat);
}

export function getEmojiImpactDelayMs(animation: EmojiAnimation): number {
  if (animation.mode === 'pop') return 120;

  return Math.round(animation.durationMs * 0.72);
}

export function getEmojiAnimationCleanupMs(animation: EmojiAnimation): number {
  if (animation.mode === 'pop') return EMOJI_POP_CLEANUP_MS;

  return animation.durationMs + EMOJI_ANIMATION_PROFILES[animation.profile].cleanupBufferMs;
}

function getDartStuckJitter(
  side: EmojiImpactSide,
  random: () => number,
): EmojiThrowPoint & { rotationDeg: number } {
  const alongEdge = (random() - 0.5) * 12;
  const offEdge = (random() - 0.5) * 3;
  const rotationDeg = (random() - 0.5) * 9;

  switch (side) {
    case 'left':
    case 'right':
      return { x: offEdge, y: alongEdge, rotationDeg };
    case 'top':
    case 'bottom':
      return { x: alongEdge, y: offEdge, rotationDeg };
    default:
      return { x: offEdge, y: alongEdge, rotationDeg };
  }
}

export function getEmojiImpactPoint(
  start: EmojiThrowPoint,
  rect: EmojiThrowRect,
): EmojiImpactPoint {
  const center = getRectCenter(rect);
  const dx = center.x - start.x;
  const dy = center.y - start.y;
  const candidates: Array<{ t: number; point: EmojiThrowPoint; side: EmojiImpactSide }> = [];

  if (dx !== 0) {
    const leftT = (rect.left - start.x) / dx;
    const leftY = start.y + leftT * dy;
    if (isValidIntersection(leftT, leftY, rect.top, rect.bottom)) {
      candidates.push({ t: leftT, point: { x: rect.left, y: leftY }, side: 'left' });
    }

    const rightT = (rect.right - start.x) / dx;
    const rightY = start.y + rightT * dy;
    if (isValidIntersection(rightT, rightY, rect.top, rect.bottom)) {
      candidates.push({ t: rightT, point: { x: rect.right, y: rightY }, side: 'right' });
    }
  }

  if (dy !== 0) {
    const topT = (rect.top - start.y) / dy;
    const topX = start.x + topT * dx;
    if (isValidIntersection(topT, topX, rect.left, rect.right)) {
      candidates.push({ t: topT, point: { x: topX, y: rect.top }, side: 'top' });
    }

    const bottomT = (rect.bottom - start.y) / dy;
    const bottomX = start.x + bottomT * dx;
    if (isValidIntersection(bottomT, bottomX, rect.left, rect.right)) {
      candidates.push({ t: bottomT, point: { x: bottomX, y: rect.bottom }, side: 'bottom' });
    }
  }

  const firstImpact = candidates
    .filter((candidate) => candidate.t >= 0 && candidate.t <= 1)
    .sort((a, b) => a.t - b.t)[0];

  if (firstImpact) {
    return {
      point: firstImpact.point,
      side: firstImpact.side,
    };
  }

  return {
    point: center,
    side: 'center',
  };
}

export function getReflectedBounceVector(
  start: EmojiThrowPoint,
  impact: EmojiImpactPoint,
  distance: number,
): EmojiThrowPoint {
  const incoming = normalizeVector({
    x: impact.point.x - start.x,
    y: impact.point.y - start.y,
  });

  const reflected = (() => {
    switch (impact.side) {
      case 'left':
      case 'right':
        return { x: -incoming.x, y: incoming.y };
      case 'top':
      case 'bottom':
        return { x: incoming.x, y: -incoming.y };
      default:
        return { x: incoming.x, y: incoming.y };
    }
  })();

  return {
    x: reflected.x * distance,
    y: reflected.y * distance,
  };
}

function getRectCenter(rect: EmojiThrowRect): EmojiThrowPoint {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function isValidIntersection(t: number, value: number, min: number, max: number): boolean {
  return t >= 0 && t <= 1 && value >= min && value <= max;
}

function getEmojiHorizontalArc(
  start: EmojiThrowPoint,
  end: EmojiThrowPoint,
  profile: EmojiAnimationProfileConfig,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  const arcMagnitude = Math.min(
    profile.arcMax,
    Math.max(profile.arcMin, distance * profile.arcDistanceScale),
  );
  const direction = dx >= 0 ? -1 : 1;

  return direction * arcMagnitude;
}

function getEmojiLandingContinuation(
  start: EmojiThrowPoint,
  end: EmojiThrowPoint,
  side: EmojiImpactSide,
  profile: EmojiAnimationProfileConfig,
): EmojiThrowPoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy) || 1;
  const continueDistance = Math.min(
    profile.continueMax,
    Math.max(profile.continueMin, distance * profile.continueDistanceScale),
  );

  return getReflectedBounceVector(start, { point: end, side }, continueDistance);
}

function getEmojiLandingBounce(
  continuation: EmojiThrowPoint,
  side: EmojiImpactSide,
  profile: EmojiAnimationProfileConfig,
  random: () => number,
): EmojiThrowPoint {
  if (side === 'center') {
    return { x: 0, y: -profile.bounceMin };
  }

  const normalizedContinuation = normalizeVector(continuation);
  const perpendicular = { x: -normalizedContinuation.y, y: normalizedContinuation.x };
  const direction = random() < 0.5 ? -1 : 1;
  const distance = profile.bounceMin + random() * (profile.bounceMax - profile.bounceMin);

  return {
    x: perpendicular.x * direction * distance,
    y: perpendicular.y * direction * distance,
  };
}

function getEmojiRotationDeg(start: EmojiThrowPoint, end: EmojiThrowPoint): number {
  return (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
}

function normalizeVector(vector: EmojiThrowPoint): EmojiThrowPoint {
  const length = Math.hypot(vector.x, vector.y) || 1;

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}
