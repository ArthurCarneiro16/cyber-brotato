export type Point = { x: number; y: number };
export type Vector = { x: number; y: number };

export function normalizedMovement(horizontal: number, vertical: number): Vector {
  const length = Math.hypot(horizontal, vertical);
  if (length === 0) return { x: 0, y: 0 };
  return { x: horizontal / length, y: vertical / length };
}

export function isInsideMeleeArc(
  origin: Point,
  target: Point,
  facingAngle: number,
  range: number,
  halfArc: number,
): boolean {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  if (Math.hypot(dx, dy) > range) return false;
  const targetAngle = Math.atan2(dy, dx);
  const difference = Math.atan2(Math.sin(targetAngle - facingAngle), Math.cos(targetAngle - facingAngle));
  return Math.abs(difference) <= halfArc;
}
