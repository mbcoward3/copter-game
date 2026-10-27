const row = (key, label, value, unit) => ({ key, label, value, unit });

// Presentation only: no routing, random choices or changes to vehicle state.
export function pilotReadout(p, { friendDistance = Infinity, homeDistance = Infinity, pierGap = Infinity } = {}) {
  const boat = p.vehicle === 'boat';
  const speed = Math.hypot(p.vel.x, p.vel.z) * 3.6;
  const rows = [row('speed', boat && p.fs < -0.2 ? 'Astern' : 'Speed', Math.round(speed), 'km/h')];
  if (!boat) {
    rows.push(row('height', 'Height', Math.round(Math.max(0, p.clearance)), 'm'));
    const vertical = p.grounded ? 0 : p.vel.y;
    rows.push(row('vertical', vertical < -0.2 ? 'Descent' : vertical > 0.2 ? 'Climb' : 'Level', Math.abs(vertical) < 0.2 ? '0.0' : Math.abs(vertical).toFixed(1), 'm/s'));
  }
  const nearbyFriend = friendDistance <= 120 && (!p.cargo.length || friendDistance < homeDistance) && p.cargo.length + p.incoming < 3 && !p.incoming;
  if (nearbyFriend) {
    rows.push(row('range', 'Friend', Math.round(friendDistance), 'm'));
  } else if (p.cargo.length && homeDistance < 90 && (boat || (p.vehicle === 'plane' && p.afloat)) && Number.isFinite(pierGap)) {
    rows.push(row('range', 'Pier gap', Math.max(0, pierGap).toFixed(1), 'm'));
  } else if (p.cargo.length && Number.isFinite(homeDistance)) {
    rows.push(row('range', 'Home', Math.round(homeDistance), 'm'));
  }
  return rows;
}

export function ratedFeedback(stars, words, advice = '') {
  return '★'.repeat(stars) + ' ' + words + (stars < 3 && advice ? ' · ' + advice : '');
}
