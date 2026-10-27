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

export function manualRescueHint(p, {
  nearHome = false, atBase = false, hasFriends = true, nearFriend = false,
  liftKey = 'Space', descendKey = 'Left Shift', winchKey = 'R', goKey = 'W', capacity = 3,
} = {}) {
  if (p.incoming) return p.vehicle === 'plane' ? 'Hold position · our friend is swimming aboard' : 'Hold position · our friend is coming aboard';
  if (p.unloading) return 'Hold position · helping our friends ashore';
  const aboard = p.cargo.length, helicopter = p.vehicle === 'heli';
  if (aboard && (nearHome || aboard >= capacity || !hasFriends)) {
    if (helicopter) {
      if (p.grounded) return atBase ? 'Hold position · our friends are getting out' : `Hold ${liftKey} to lift off and bring our friends home`;
      return nearHome ? `Land at the base, or hold ${winchKey} to lower friends to the paddock` : 'Bring our friends home · land at the base';
    }
    if (p.vehicle === 'boat') return 'Bring our friends to the home jetty and stop';
    return p.afloat ? 'Taxi alongside the home jetty and stop' : 'Head home · land on water near the jetty';
  }
  if (aboard) {
    if (helicopter) return p.grounded ? `${aboard} aboard · ${liftKey} to lift off, then rescue more or head home` : `${aboard} aboard · ${winchKey} for another friend, or head home`;
    if (p.vehicle === 'boat') return `${aboard} aboard · rescue another friend, or return to the jetty`;
    return p.afloat ? `${aboard} aboard · taxi to another friend, or return to the jetty` : `${aboard} aboard · land for another friend, or fly home`;
  }
  if (helicopter) return p.grounded ? `Hold ${liftKey} to lift off` : `Hover over a friend and hold ${winchKey} to winch`;
  if (p.vehicle === 'boat') return 'Stop beside a friend to throw the ring';
  if (p.afloat) return nearFriend ? 'Taxi beside a friend and slow down to let them aboard' : `${goKey} to taxi · hold for takeoff`;
  return `Hold ${descendKey} to land on water near a friend`;
}
