// Swept segment test prevents a fast bullet skipping over a target at low FPS.
export function segmentHitsSphere(start, end, center, radiusSquared) {
  const x = end.x - start.x, y = end.y - start.y, z = end.z - start.z;
  const lengthSquared = x*x + y*y + z*z;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((center.x-start.x)*x + (center.y-start.y)*y + (center.z-start.z)*z) / lengthSquared));
  const dx = start.x + t*x - center.x;
  const dy = start.y + t*y - center.y;
  const dz = start.z + t*z - center.z;
  return dx*dx + dy*dy + dz*dz < radiusSquared;
}

export function sphereIntersectsBounds(center, radius, bounds) {
  const x = Math.max(bounds.minX, Math.min(center.x, bounds.maxX));
  const y = Math.max(bounds.minY, Math.min(center.y, bounds.maxY));
  const z = Math.max(bounds.minZ, Math.min(center.z, bounds.maxZ));
  const dx = center.x - x;
  const dy = center.y - y;
  const dz = center.z - z;
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}
