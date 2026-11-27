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

export interface FreecamInput {
  forward: number; // +1 forward (W), -1 backward (S)
  right: number;   // +1 strafe right (D), -1 strafe left (A)
  up: number;      // +1 ascend (Space/E), -1 descend (Shift/Q)
}

/**
 * Computes a non-z-fighting 3D sphere center for a Red Dot Marker slightly
 * offset along the outward surface normal from a raycast hit point.
 */
export function computeMarkerPlacement(
  hitPoint: Vec3,
  surfaceNormal: Vec3 | null | undefined,
  radius = 0.32,
  offsetFactor = 0.85
): Vec3 {
  let nx = surfaceNormal ? surfaceNormal.x : 0;
  let ny = surfaceNormal ? surfaceNormal.y : 1;
  let nz = surfaceNormal ? surfaceNormal.z : 0;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-6) {
    nx = 0;
    ny = 1;
    nz = 0;
  } else {
    nx /= len;
    ny /= len;
    nz /= len;
  }
  const offset = radius * offsetFactor;
  return {
    x: hitPoint.x + nx * offset,
    y: hitPoint.y + ny * offset,
    z: hitPoint.z + nz * offset,
  };
}

/**
 * Clamps Freecam pitch strictly inside [-85°, +85°] to prevent gimbal flipping.
 */
export function clampFreecamPitch(pitchRad: number): number {
  const limit = 85 * DEG2RAD;
  return Math.max(-limit, Math.min(limit, pitchRad));
}

/**
 * Advances a Freecam position smoothly along horizontal heading (yaw) and
 * world vertical axis (Y) for responsive flight through courtyards and corridors.
 */
export function stepFreecamPosition(
  pos: Vec3,
  yawRad: number,
  _pitchRad: number,
  input: FreecamInput,
  speedMetersPerSec: number,
  dt: number,
  minY = 0.35
): Vec3 {
  const sinY = Math.sin(yawRad);
  const cosY = Math.cos(yawRad);
  // Three.js camera with YXZ rotation looks along (-sin(yaw), 0, -cos(yaw)) horizontally
  const fwdX = -sinY;
  const fwdZ = -cosY;
  // Right vector is (cos(yaw), 0, -sin(yaw))
  const rightX = cosY;
  const rightZ = -sinY;

  let moveX = fwdX * input.forward + rightX * input.right;
  let moveZ = fwdZ * input.forward + rightZ * input.right;
  const horizLen = Math.hypot(moveX, moveZ);
  if (horizLen > 1) {
    moveX /= horizLen;
    moveZ /= horizLen;
  }

  const dist = speedMetersPerSec * Math.max(0, dt);
  return {
    x: pos.x + moveX * dist,
    y: Math.max(minY, pos.y + input.up * dist),
    z: pos.z + moveZ * dist,
  };
}

/**
 * Snaps an editable campus group's vertical coordinate back to ground level (Y = 0).
 */
export function snapYToGround(pos: Vec3, groundY = 0): Vec3 {
  return { x: pos.x, y: groundY, z: pos.z };
}

export type SelectionScope = 'single' | 'group';

export interface SelectableNodeLike {
  parent?: SelectableNodeLike | null;
  userData: {
    isSelectableObject?: boolean;
    isCategoryGroup?: boolean;
    editableId?: string;
    name?: string;
  };
}

/**
 * Traverses upward from a raycast-hit mesh to find either the closest individual
 * selectable object ('single' scope) or its parent category container ('group' scope).
 */
export function resolveSelectableTarget<T extends SelectableNodeLike>(
  hitNode: T | null | undefined,
  scope: SelectionScope
): T | null {
  let cursor: SelectableNodeLike | null | undefined = hitNode;
  let closestSingle: T | null = null;
  let categoryGroup: T | null = null;

  while (cursor) {
    const ud = cursor.userData || {};
    if (!closestSingle && ud.isSelectableObject === true) {
      closestSingle = cursor as T;
      if (scope === 'single') return closestSingle;
    }
    if (!categoryGroup && ud.isCategoryGroup === true) {
      categoryGroup = cursor as T;
    }
    cursor = cursor.parent;
  }

  if (scope === 'group') {
    return categoryGroup || closestSingle;
  }
  return closestSingle;
}

export type MarkerColor = 'red' | 'green' | 'yellow' | 'grey';

export const MARKER_COLOR_HEX: Record<MarkerColor, string> = {
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  grey: '#6b7280',
};

export type MarkerClickResolution =
  | { action: 'remove' }
  | { action: 'recolor'; nextColor: MarkerColor };

/**
 * Resolves clicking an existing dot marker:
 * - In erase mode: always removes the dot.
 * - Different active color: recolors the dot to activeColor.
 * - Same active color: removes the dot.
 */
export function resolveExistingMarkerClick(
  existingColor: MarkerColor,
  activeColor: MarkerColor,
  eraseMode: boolean
): MarkerClickResolution {
  if (eraseMode || existingColor === activeColor) {
    return { action: 'remove' };
  }
  return { action: 'recolor', nextColor: activeColor };
}

export interface MarkerSummary {
  total: number;
  red: number;
  green: number;
  yellow: number;
  grey: number;
  label: string;
}

/**
 * Computes total and per-color marker counts plus the formatted toolbar counter label.
 */
export function summarizeMarkerCounts(colors: ReadonlyArray<MarkerColor>): MarkerSummary {
  let red = 0;
  let green = 0;
  let yellow = 0;
  let grey = 0;
  for (const c of colors) {
    if (c === 'red') red++;
    else if (c === 'green') green++;
    else if (c === 'yellow') yellow++;
    else if (c === 'grey') grey++;
  }
  const total = red + green + yellow + grey;
  return {
    total,
    red,
    green,
    yellow,
    grey,
    label: `Markers: ${total} (R:${red} G:${green} Y:${yellow} Gr:${grey})`,
  };
}

export interface RealisticSunState {
  hour: number;
  timeLabel: string;
  elevationDeg: number;
  position: Vec3;
  sunColor: string;
  sunIntensity: number;
  hemiSkyColor: string;
  hemiGroundColor: string;
  hemiIntensity: number;
  fillColor: string;
  fillIntensity: number;
  ambientIntensity: number;
  skyTopColor: string;
  skyMidColor: string;
  skyHorizonColor: string;
  fogColor: string;
  exposure: number;
  envIntensity: number;
}

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpHex(hexA: number, hexB: number, t: number): string {
  const ar = (hexA >> 16) & 0xff;
  const ag = (hexA >> 8) & 0xff;
  const ab = hexA & 0xff;
  const br = (hexB >> 16) & 0xff;
  const bg = (hexB >> 8) & 0xff;
  const bb = hexB & 0xff;
  const r = Math.round(lerpNum(ar, br, t));
  const g = Math.round(lerpNum(ag, bg, t));
  const b = Math.round(lerpNum(ab, bb, t));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/**
 * Formats decimal hours (e.g. 16.75) as HH:MM ("16:45").
 */
export function formatSolarTime(hour: number): string {
  const clamped = Math.max(6, Math.min(18.5, hour));
  const h = Math.floor(clamped);
  const m = Math.round((clamped - h) * 60);
  const finalH = m === 60 ? h + 1 : h;
  const finalM = m === 60 ? 0 : m;
  return `${String(finalH).padStart(2, '0')}:${String(finalM).padStart(2, '0')}`;
}

/**
 * Computes deterministic physically-motivated sun position, color temperatures,
 * sky dome gradient, and ACES exposure for Realistic Lighting mode along a Jakarta solar arc
 * (-X = East sunrise, +X = West sunset, +Z = North slight inclination).
 */
export function computeRealisticSunState(hour: number, radius = 115): RealisticSunState {
  const h = Math.max(6.0, Math.min(18.5, hour));
  // Progress 0 at 06:00 (East) -> 0.5 at 12:15 (Zenith) -> 1.0 at 18:30 (West)
  const dayProgress = (h - 6.0) / 12.5;
  const arcAngle = dayProgress * Math.PI; // 0 .. PI

  // Elevation rises smoothly from 7° at sunrise/dusk to 72° at solar noon
  const elevDeg = 7 + Math.sin(arcAngle) * 65;
  const elevRad = elevDeg * DEG2RAD;
  const horizR = Math.cos(elevRad) * radius;

  // East (-X) to West (+X), tilted slightly toward North (+Z) for sculpted facade modeling
  const sunX = -Math.cos(arcAngle) * horizR;
  const sunY = Math.sin(elevRad) * radius;
  const sunZ = (0.36 + 0.14 * Math.sin(arcAngle)) * horizR;

  // Smooth daylight height factor (0 at low horizon, 1 at high midday sun)
  const noonFactor = Math.max(0, Math.min(1, (elevDeg - 7) / 65));
  const goldenFactor = Math.max(0, Math.min(1, (elevDeg - 7) / 28)); // 0 at dusk, 1 above ~35°
  const isAfternoon = dayProgress > 0.52;

  const sunColor = goldenFactor < 1
    ? lerpHex(isAfternoon ? 0xff8d3f : 0xffad60, 0xffeed6, goldenFactor)
    : lerpHex(0xffeed6, 0xfff8eb, noonFactor);

  const skyTopColor = lerpHex(isAfternoon ? 0x1f3561 : 0x2d5187, 0x2a66ad, goldenFactor);
  const skyMidColor = lerpHex(isAfternoon ? 0x73769c : 0x7ca6d1, 0x7ab0e0, goldenFactor);
  const skyHorizonColor = lerpHex(isAfternoon ? 0xf2aa72 : 0xf5cfa3, 0xd4e5f5, goldenFactor);
  const hemiSkyColor = lerpHex(0x6e94c7, 0x8fbce8, goldenFactor);
  const hemiGroundColor = lerpHex(0x4a3e33, 0x6b6257, goldenFactor);
  const fillColor = lerpHex(0x6d8bb5, 0x9ec0e6, goldenFactor);

  return {
    hour: h,
    timeLabel: formatSolarTime(h),
    elevationDeg: Number(elevDeg.toFixed(2)),
    position: {
      x: Number(sunX.toFixed(3)),
      y: Number(sunY.toFixed(3)),
      z: Number(sunZ.toFixed(3)),
    },
    sunColor,
    sunIntensity: Number(lerpNum(1.95, 3.55, Math.pow(noonFactor, 0.5)).toFixed(3)),
    hemiSkyColor,
    hemiGroundColor,
    hemiIntensity: Number(lerpNum(0.24, 0.44, goldenFactor).toFixed(3)),
    fillColor,
    fillIntensity: Number(lerpNum(0.06, 0.14, goldenFactor).toFixed(3)),
    ambientIntensity: Number(lerpNum(0.02, 0.04, goldenFactor).toFixed(3)),
    skyTopColor,
    skyMidColor,
    skyHorizonColor,
    fogColor: skyHorizonColor,
    exposure: Number(lerpNum(0.88, 0.98, goldenFactor).toFixed(3)),
    envIntensity: Number(lerpNum(0.18, 0.30, goldenFactor).toFixed(3)),
  };
}

export interface XRayMaterialState {
  enabled: boolean;
  opacityPercent: number;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
  depthPrepassVisible: boolean;
  edgeOpacity: number;
  interiorEdgeOpacity: number;
  markerDepthTest: boolean;
  markerTransparent: boolean;
  markerRenderOrder: number;
}

const XRAY_EXCLUDED_BUILDING_IDS = new Set([
  'main-basketball-court',
  'inner-courtyard-floor',
  'rear-garden-patio',
  'court-corridor-drain',
  'court-utility-plinth',
  'ceremonial-flagpole',
  'inner-court-goal',
  'inner-court-flagpole',
  'front-black-gate',
  'sign-wall',
  'second-gate',
  'entrance-wall-fountain',
  'rear-wall-fountain',
  'plaza-kiosk-planter',
]);

const XRAY_BUILDING_PREFIXES = [
  'gedung-a-',
  'gedung-b-',
  'masjid-',
  'podium',
  'security-post',
  'entrance-canopy-',
  'front-left-shed',
  'back-breezeway-',
  'rear-storage-shed',
  'rear-gazebo',
];

/**
 * Clamps an X-Ray wall opacity percentage into [15, 100] and returns integer percent.
 */
export function clampXRayOpacityPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 25;
  return Math.max(15, Math.min(100, Math.round(percent)));
}

/**
 * Determines whether a campus editable structure is an architectural building
 * volume (walls, roofs, floor slabs, stairwells, canopies, podium, mosque, sheds)
 * that should become translucent in X-Ray View while keeping ground, courts,
 * fences, and trees opaque.
 */
export function isXRayBuildingEditableId(editableId: string | null | undefined): boolean {
  if (!editableId) return false;
  if (XRAY_EXCLUDED_BUILDING_IDS.has(editableId)) return false;
  return XRAY_BUILDING_PREFIXES.some((prefix) => editableId.startsWith(prefix));
}

/**
 * Computes deterministic Three.js material & marker rendering flags for
 * Translucent / X-Ray Building Mode.
 * Uses a transparent depth pre-pass shell so translucent building walls never
 * z-sort inside-out at any opacity (15%..99%), keeps front architectural edges
 * crisp (~80%), softly fades subtle interior blueprint edges to 0% as walls
 * approach opaque, and renders placed dots in the transparent pass at
 * renderOrder 999 so markers stay 100% solid and visible through every wall.
 */
export function computeXRayMaterialState(
  enabled: boolean,
  opacityPercent = 25
): XRayMaterialState {
  const clampedPct = clampXRayOpacityPercent(opacityPercent);
  if (!enabled) {
    return {
      enabled: false,
      opacityPercent: clampedPct,
      opacity: 1.0,
      transparent: false,
      depthWrite: true,
      depthPrepassVisible: false,
      edgeOpacity: 1.0,
      interiorEdgeOpacity: 0,
      markerDepthTest: true,
      markerTransparent: false,
      markerRenderOrder: 999,
    };
  }
  const opacity = Number((clampedPct / 100).toFixed(2));
  const isTranslucent = clampedPct < 100;
  return {
    enabled: true,
    opacityPercent: clampedPct,
    opacity,
    transparent: isTranslucent,
    depthWrite: !isTranslucent,
    depthPrepassVisible: isTranslucent,
    edgeOpacity: isTranslucent ? 0.80 : 0.85,
    interiorEdgeOpacity: isTranslucent ? Number(((1 - opacity) * 0.14).toFixed(3)) : 0,
    markerDepthTest: false,
    markerTransparent: true,
    markerRenderOrder: 999,
  };
}

export interface AdaptiveDprOptions {
  devicePixelRatio: number;
  isSoftwareGl: boolean;
  isInteracting: boolean;
  isCoarsePointer: boolean;
}

/**
 * Computes an adaptive WebGL pixel ratio capped at 2x at rest and stepped down
 * to 1.5x during active dragging/orbiting on high-DPI / mobile screens to prevent
 * GPU overheating and frame drops.
 */
export function computeAdaptivePixelRatio({
  devicePixelRatio,
  isSoftwareGl,
  isInteracting,
  isCoarsePointer,
}: AdaptiveDprOptions): number {
  if (isSoftwareGl) return 1;
  const safeDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const idleCap = Math.min(safeDpr, 2);
  if (isInteracting && (isCoarsePointer || idleCap > 1.5)) {
    return Math.min(idleCap, 1.5);
  }
  return idleCap;
}

/**
 * Guards throttled pointer/UI updates: skips touch hover raycasts entirely and
 * enforces a minimum millisecond cooldown between executions.
 */
export function shouldRunThrottledAction(
  nowMs: number,
  lastMs: number,
  minIntervalMs: number,
  skipForTouch = false
): boolean {
  if (skipForTouch) return false;
  return nowMs - lastMs >= minIntervalMs;
}

/**
 * Generates a deterministic cache key for shared BoxGeometry instances so
 * identical structural elements (columns, windows, treads, fence posts, benches)
 * reuse a single GPU BufferGeometry and EdgesGeometry.
 */
export function makeBoxGeometryKey(w: number, h: number, d: number): string {
  return `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
}

/**
 * Computes consistent, framerate-independent frame delta time (in seconds)
 * strictly from consecutive requestAnimationFrame timestamps.
 * - On wakeup from an idle loop (lastFrameMs === null), uses a steady 1/60s
 *   initial step so waking from idle never lurches or stalls.
 * - Never subtracts render work from dt, keeping freecam speed constant across
 *   60Hz, 120Hz, mobile, and heavy/light views alike.
 */
export function computeFrameDeltaSeconds(
  nowMs: number,
  lastFrameMs: number | null,
  maxDt = 0.05,
  initialDt = 1 / 60
): number {
  if (lastFrameMs === null || !Number.isFinite(lastFrameMs) || !Number.isFinite(nowMs)) {
    return initialDt;
  }
  const rawDt = (nowMs - lastFrameMs) / 1000;
  if (rawDt <= 0) return 0;
  return Math.min(maxDt, rawDt);
}





