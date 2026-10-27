// Equipment compatibility only. Presentation must never run navigation or change its reachability caches.
export function showRescueFor(vehicle, friend, now = 0) {
  if (friend.fire) {
    const fire = friend.fire;
    if (fire.out) return false;
    return vehicle === 'heli' || (vehicle === 'boat' ? !!fire.shore : !!fire.scoop && fire.scoopOk !== false);
  }
  if (vehicle === 'heli') return true;
  if (friend.landlocked || ['camp', 'ledge', 'perch', 'wreck'].includes(friend.kind)) return false;
  return vehicle !== 'plane' || (friend.kind !== 'hut' && !(friend.noPlaneUntil > now));
}
