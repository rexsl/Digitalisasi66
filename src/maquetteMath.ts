export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Rect2D {
  name: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface OrthoFrustum {
  left: number;
  right: number;
  top: number;
  bottom: number;
  visibleHeight: number;
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Computes exact Orthographic frustum half-extents that match a PerspectiveCamera's
 * visible vertical span at distance `distance` from its orbit target.
 */
export function perspectiveToOrthoFrustum(
  fovDeg: number,
  distance: number,
  aspect: number
): OrthoFrustum {
  const halfHeight = Math.max(0.5, distance * Math.tan((fovDeg * DEG2RAD) / 2));
  const halfWidth = halfHeight * aspect;
  return {
    left: -halfWidth,
    right: halfWidth,
    top: halfHeight,
    bottom: -halfHeight,
    visibleHeight: halfHeight * 2,
  };
}

/**
 * Computes exact Perspective camera distance from target that matches an
 * OrthographicCamera's current visible height `(top - bottom) / zoom`.
 */
export function orthoToPerspectiveDistance(
  top: number,
  bottom: number,
  zoom: number,
  fovDeg: number
): number {
  const visibleHeight = (top - bottom) / Math.max(0.01, zoom);
  const halfFovRad = (fovDeg * DEG2RAD) / 2;
  return visibleHeight / (2 * Math.tan(halfFovRad));
}

/**
 * Converts spherical orbit angles (azimuth 0..360 deg from +Z toward +X,
 * elevation 5..90 deg above XZ plane) and radius into Cartesian offset.
 */
export function sphericalToCartesian(
  azimuthDeg: number,
  elevationDeg: number,
  radius: number
): Vec3 {
  const clampedElev = Math.min(89.8, Math.max(2, elevationDeg));
  const az = azimuthDeg * DEG2RAD;
  const el = clampedElev * DEG2RAD;
  const cosEl = Math.cos(el);
  return {
    x: radius * cosEl * Math.sin(az),
    y: radius * Math.sin(el),
    z: radius * cosEl * Math.cos(az),
  };
}

/**
 * Converts a Cartesian camera offset `(pos - target)` back to normalized
 * azimuth `[0, 360)`, elevation `[0, 90]`, and radius.
 */
export function cartesianToSpherical(offset: Vec3): {
  azimuthDeg: number;
  elevationDeg: number;
  radius: number;
} {
  const radius = Math.hypot(offset.x, offset.y, offset.z);
  if (radius < 1e-6) {
    return {azimuthDeg: 0, elevationDeg: 45, radius: 1};
  }
  const elevationDeg = Math.asin(Math.max(-1, Math.min(1, offset.y / radius))) * RAD2DEG;
  let azimuthDeg = Math.atan2(offset.x, offset.z) * RAD2DEG;
  if (azimuthDeg < 0) azimuthDeg += 360;
  return {azimuthDeg, elevationDeg, radius};
}

/**
 * Checks whether two axis-aligned 2D ground footprints strictly overlap
 * (sharing a boundary edge is permitted).
 */
export function rectsOverlapStrictly(a: Rect2D, b: Rect2D, epsilon = 1e-4): boolean {
  return (
    a.minX < b.maxX - epsilon &&
    a.maxX > b.minX + epsilon &&
    a.minZ < b.maxZ - epsilon &&
    a.maxZ > b.minZ + epsilon
  );
}

/**
 * Core campus building & court footprints for SMA Negeri 66 Jakarta
 * (1 unit = 1 meter; Front Jl. Bango III is +Z, Rear South is -Z,
 * East/Front-Left is -X, West/Right is +X).
 */
export const CAMPUS_FOOTPRINTS: Rect2D[] = [
  {name: 'Gedung B North-South Wing', minX: -35.0, maxX: -24.5, minZ: -25.0, maxZ: 13.5},
  {name: 'Gedung B South L-Wing', minX: -24.5, maxX: -11.0, minZ: -25.0, maxZ: -14.5},
  {name: 'Main Basketball Court', minX: -18.5, maxX: -2.5, minZ: -13.5, maxZ: 8.5},
  {name: 'Rear Greenhouse Garden', minX: -37.2, maxX: -21.6, minZ: -34.8, maxZ: -25.8},
  {name: 'Rear Storage Shed (Gudang)', minX: -19.5, maxX: -15.3, minZ: -34.5, maxZ: -27.7},
  {name: 'Rear Courtyard Gazebo', minX: -2.35, maxX: 2.65, minZ: -31.3, maxZ: -26.3},
  {name: 'Gedung A East Wing', minX: 4.5, maxX: 13.0, minZ: -31.5, maxZ: 14.0},
  {name: 'Gedung A West Wing', minX: 29.0, maxX: 37.5, minZ: -22.0, maxZ: 14.0},
  {name: 'Gedung A North Wing', minX: 20.5, maxX: 29.0, minZ: 5.5, maxZ: 14.0},
  {name: 'Gedung A Extended Front-Right Wrap', minX: 20.5, maxX: 37.5, minZ: 14.0, maxZ: 24.5},
  {name: 'Gedung A South Wing', minX: 13.0, maxX: 29.0, minZ: -22.0, maxZ: -13.5},
  {name: 'Inner Courtyard', minX: 13.0, maxX: 29.0, minZ: -13.5, maxZ: 5.5},
  {name: 'Masjid Khunuzul Ibad (2F Conjoined)', minX: 15.4, maxX: 26.6, minZ: -30.4, maxZ: -22.0},
];

export const JL_BANGO_ROAD_POLY_XZ: ReadonlyArray<readonly [number, number]> = [
  [-47.0, 32.8],
  [-7.8, 32.8],
  [-7.8, 44.0],
  [-0.8, 44.0],
  [-0.8, 32.0],
  [-0.8, 25.8],
  [-47.0, 25.8],
];
