import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { shouldKeepStalePackageAliveForQueue } from './digital-twin.component';

describe('shouldKeepStalePackageAliveForQueue', () => {
  it('keeps assembled packages alive while they are still queued before the camera', () => {
    const pkg = { type: 'assembled' as const, targetX: 20, lastSeen: 1000 };

    expect(shouldKeepStalePackageAliveForQueue(pkg, 5000)).toBe(true);
  });

  it('keeps packages alive when they are at the queue front before the camera', () => {
    const pkg = { type: 'assembled' as const, targetX: 27.55, lastSeen: 1000 };

    expect(shouldKeepStalePackageAliveForQueue(pkg, 5000)).toBe(true);
  });

  it('does not keep packages alive once they have already passed the queue front', () => {
    const pkg = { type: 'assembled' as const, targetX: 30, lastSeen: 1000 };

    expect(shouldKeepStalePackageAliveForQueue(pkg, 5000)).toBe(false);
  });
});
