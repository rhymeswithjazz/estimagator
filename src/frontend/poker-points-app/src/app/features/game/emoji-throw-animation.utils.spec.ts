import { describe, expect, it } from 'vitest';
import {
  createEmojiImpactSplat,
  createEmojiPoopSplat,
  createEmojiAnimation,
  getEmojiAnimationCleanupMs,
  getEmojiAnimationStyle,
  getEmojiImpactSplatKind,
  getEmojiImpactSplatStyle,
  getEmojiImpactDelayMs,
  getEmojiPoopSplatStyle,
  getEmojiStuckDartStyle,
  getEmojiImpactPoint,
  getReflectedBounceVector,
  EmojiThrowRect,
} from './emoji-throw-animation.utils';
import {
  AIRPLANE_THROW_OPTION,
  DART_THROW_OPTION,
  EGG_THROW_OPTION,
  EmojiThrownEvent,
  ROCK_THROW_OPTION,
  TOMATO_THROW_OPTION,
} from '../../core/models/session.models';

describe('emoji throw animation utils', () => {
  const targetRect: EmojiThrowRect = {
    left: 100,
    top: 100,
    right: 140,
    bottom: 180,
    width: 40,
    height: 80,
  };

  const event: EmojiThrownEvent = {
    throwId: 'throw-id',
    senderParticipantId: 'sender-id',
    senderDisplayName: 'Sender',
    targetParticipantId: 'target-id',
    emoji: '❤️',
    sentAtUtc: '2026-04-28T00:00:00Z',
  };

  it('computes border impact points for each side of a target rectangle', () => {
    expect(getEmojiImpactPoint({ x: 0, y: 140 }, targetRect)).toEqual({
      point: { x: 100, y: 140 },
      side: 'left',
    });
    expect(getEmojiImpactPoint({ x: 240, y: 140 }, targetRect)).toEqual({
      point: { x: 140, y: 140 },
      side: 'right',
    });
    expect(getEmojiImpactPoint({ x: 120, y: 0 }, targetRect)).toEqual({
      point: { x: 120, y: 100 },
      side: 'top',
    });
    expect(getEmojiImpactPoint({ x: 120, y: 280 }, targetRect)).toEqual({
      point: { x: 120, y: 180 },
      side: 'bottom',
    });
  });

  it('reflects the bounce vector away from the impacted side', () => {
    expect(
      getReflectedBounceVector({ x: 0, y: 140 }, { point: { x: 100, y: 140 }, side: 'left' }, 50),
    ).toEqual({ x: -50, y: 0 });

    expect(
      getReflectedBounceVector({ x: 120, y: 0 }, { point: { x: 120, y: 100 }, side: 'top' }, 40),
    ).toEqual({ x: 0, y: -40 });
  });

  it('selects dart, airplane, rock, and default motion profiles', () => {
    const targetGeometry = {
      center: { x: 120, y: 140 },
      surfaceRect: targetRect,
    };
    const senderCenter = { x: 0, y: 140 };

    const dartAnimation = createEmojiAnimation(
      { ...event, emoji: DART_THROW_OPTION },
      targetGeometry,
      senderCenter,
      false,
      () => 0,
    );
    const airplaneAnimation = createEmojiAnimation(
      { ...event, emoji: AIRPLANE_THROW_OPTION },
      targetGeometry,
      senderCenter,
      false,
      () => 0,
    );
    const defaultAnimation = createEmojiAnimation(
      event,
      targetGeometry,
      senderCenter,
      false,
      () => 0,
    );
    const rockAnimation = createEmojiAnimation(
      { ...event, emoji: ROCK_THROW_OPTION },
      targetGeometry,
      senderCenter,
      false,
      () => 0,
    );

    expect(dartAnimation.profile).toBe('dart');
    expect(dartAnimation.durationMs).toBeLessThan(defaultAnimation.durationMs);
    expect(Math.abs(dartAnimation.horizontalArc)).toBeLessThan(
      Math.abs(defaultAnimation.horizontalArc),
    );

    expect(airplaneAnimation.profile).toBe('airplane');
    expect(airplaneAnimation.durationMs).toBeGreaterThan(defaultAnimation.durationMs);
    expect(Math.abs(airplaneAnimation.horizontalArc)).toBeGreaterThan(
      Math.abs(defaultAnimation.horizontalArc),
    );

    expect(rockAnimation.profile).toBe('rock');
    expect(rockAnimation.durationMs).toBeLessThan(defaultAnimation.durationMs);
    expect(Math.abs(rockAnimation.landingContinueX)).toBeGreaterThan(
      Math.abs(defaultAnimation.landingContinueX),
    );

    expect(defaultAnimation.profile).toBe('default');
    expect(getEmojiAnimationStyle(dartAnimation)).toContain('--e-duration: 520ms');
    expect(getEmojiAnimationCleanupMs(airplaneAnimation)).toBeGreaterThan(
      getEmojiAnimationCleanupMs(defaultAnimation),
    );
  });

  it('creates a stuck dart style at the impact point with subtle pile jitter', () => {
    const animation = createEmojiAnimation(
      { ...event, emoji: DART_THROW_OPTION },
      {
        center: { x: 120, y: 140 },
        surfaceRect: targetRect,
      },
      { x: 0, y: 140 },
      false,
      () => 0.75,
    );

    expect(animation.landingContinueX).toBe(0);
    expect(animation.landingContinueY).toBe(0);
    expect(getEmojiStuckDartStyle(animation)).toContain('left: 100.75px');
    expect(getEmojiStuckDartStyle(animation)).toContain('top: 143px');
    expect(getEmojiStuckDartStyle(animation)).toContain('--e-angle: 2.25deg');
  });

  it('creates a poop splat at the impact point when the throw lands', () => {
    const animation = createEmojiAnimation(
      { ...event, emoji: '💩' },
      {
        center: { x: 120, y: 140 },
        surfaceRect: targetRect,
      },
      { x: 0, y: 140 },
      false,
      () => 0.5,
    );
    const splat = createEmojiPoopSplat(animation, () => 0.5);

    expect(animation.landingContinueX).toBe(0);
    expect(animation.landingContinueY).toBe(0);
    expect(animation.landingBounceX).toBe(0);
    expect(animation.landingBounceY).toBe(0);
    expect(getEmojiImpactDelayMs(animation)).toBe(504);
    expect(getEmojiPoopSplatStyle(splat)).toContain('left: 100px');
    expect(getEmojiPoopSplatStyle(splat)).toContain('top: 140px');
    expect(getEmojiPoopSplatStyle(splat)).toContain('--splat-scale: 1.025');
  });

  it('creates tomato and egg splats at the impact point when those throws land', () => {
    const targetGeometry = {
      center: { x: 120, y: 140 },
      surfaceRect: targetRect,
    };
    const tomatoAnimation = createEmojiAnimation(
      { ...event, emoji: TOMATO_THROW_OPTION },
      targetGeometry,
      { x: 0, y: 140 },
      false,
      () => 0.5,
    );
    const eggAnimation = createEmojiAnimation(
      { ...event, emoji: EGG_THROW_OPTION },
      targetGeometry,
      { x: 0, y: 140 },
      false,
      () => 0.5,
    );

    expect(getEmojiImpactSplatKind(TOMATO_THROW_OPTION)).toBe('tomato');
    expect(getEmojiImpactSplatKind(EGG_THROW_OPTION)).toBe('egg');
    expect(tomatoAnimation.landingContinueX).toBe(0);
    expect(eggAnimation.landingContinueX).toBe(0);
    expect(createEmojiImpactSplat(tomatoAnimation, 'tomato', () => 0.5).kind).toBe('tomato');
    expect(
      getEmojiImpactSplatStyle(createEmojiImpactSplat(eggAnimation, 'egg', () => 0.5)),
    ).toContain('--splat-scale: 1.075');
  });

  it('keeps leftward airplane throws upright by mirroring vertically', () => {
    const targetGeometry = {
      center: { x: 120, y: 140 },
      surfaceRect: targetRect,
    };

    const leftwardAirplane = createEmojiAnimation(
      { ...event, emoji: AIRPLANE_THROW_OPTION },
      targetGeometry,
      { x: 240, y: 140 },
      false,
      () => 0,
    );
    const rightwardAirplane = createEmojiAnimation(
      { ...event, emoji: AIRPLANE_THROW_OPTION },
      targetGeometry,
      { x: 0, y: 140 },
      false,
      () => 0,
    );

    expect(leftwardAirplane.flipY).toBe(-1);
    expect(getEmojiAnimationStyle(leftwardAirplane)).toContain('--e-flip-y: -1');
    expect(rightwardAirplane.flipY).toBe(1);
  });

  it('uses pop mode when the sender is missing or motion is reduced', () => {
    const targetGeometry = {
      center: { x: 120, y: 140 },
      surfaceRect: targetRect,
    };

    const missingSenderAnimation = createEmojiAnimation(event, targetGeometry, null, false);
    const reducedMotionAnimation = createEmojiAnimation(
      event,
      targetGeometry,
      { x: 0, y: 140 },
      true,
    );

    expect(missingSenderAnimation.mode).toBe('pop');
    expect(missingSenderAnimation.toX).toBe(120);
    expect(missingSenderAnimation.toY).toBe(140);
    expect(reducedMotionAnimation.mode).toBe('pop');
  });
});
