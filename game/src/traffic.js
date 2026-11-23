// traffic.js — one job: the city's moving and parked cars. Traffic picks random graph
// destinations and drives the road network, braking for whatever is ahead; parked cars line
// the streets as the player's supply of stealable wheels. Far or wrecked traffic quietly
// recycles to the far side of the player's world.
import { createVehicle, stepVehicle, collideBuildings, CAR_TYPES } from './vehicles.js';
import { clamp, angDiff, dist2d } from './rng.js';

const TRAFFIC_TYPES = ['sedan', 'sedan', 'taxi', 'hatch', 'hatch', 'pickup', 'van', 'sports'];
const PARKED_COUNT = 52;
const TRAFFIC_COUNT = 16;

export function createTraffic(G, rng) {
  const city = G.city;
  const cars = [];

  function randomRoadNode(minR, maxR, cx, cz) {
    for (let tries = 0; tries < 24; tries++) {
      const n = city.randomNode();
      const d = dist2d(n.x, n.z, cx, cz);
      if (d >= minR && d <= maxR && city.height(n.x, n.z) > 0.3) return n;
    }
    return null;
  }
  function giveDestination(car) {
    const dest = randomRoadNode(60, 700, car.mesh.position.x, car.mesh.position.z) || city.randomNode();
    car.path = city.route(car.mesh.position.x, car.mesh.position.z, dest.x, dest.z);
    car.pathI = 0;
    car.dest = dest;
  }
  function spawnTraffic(x, z) {
    const type = rng.pick(TRAFFIC_TYPES);
    const car = createVehicle(city, type, rng.pick(CAR_TYPES[type].colors), x, z, rng.range(0, Math.PI * 2), 'traffic');
    car.cruise = rng.range(10.5, 14.5);
    car.path = null;
    giveDestination(car);
    G.scene.add(car.mesh);
    G.vehicles.push(car);
    cars.push(car);
    return car;
  }
  // parked cars along the streets
  {
    let placed = 0, guard = 0;
    while (placed < PARKED_COUNT && guard++ < 900) {
      const road = rng.pick(city.roads);
      const i = rng.int(1, road.pts.length - 2);
      const p = road.pts[i], q = road.pts[i + 1];
      const dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz) || 1;
      const side = rng.chance(0.5) ? 1 : -1;
      const x = p.x + (-dz / len) * side * (road.width / 2 + 2.3);
      const z = p.z + (dx / len) * side * (road.width / 2 + 2.3);
      if (city.height(x, z) < 0.4) continue;
      if (collideBuildings(city, x, z, 2.1).hit) continue; // never park inside a building's footprint
      if (Object.values(city.places).some((pl) => dist2d(x, z, pl.x, pl.z) < 14)) continue;
      if (G.vehicles.some((v) => dist2d(x, z, v.mesh.position.x, v.mesh.position.z) < 8)) continue;
      const type = rng.pick(TRAFFIC_TYPES);
      const car = createVehicle(city, type, rng.pick(CAR_TYPES[type].colors), x, z, Math.atan2(dx, dz) + (side < 0 ? Math.PI : 0), 'parked');
      G.scene.add(car.mesh);
      G.vehicles.push(car);
      placed++;
    }
  }
  const origin = city.places.garage;
  for (let i = 0; i < TRAFFIC_COUNT; i++) {
    const n = randomRoadNode(60, 420, origin.x, origin.z);
    if (n) spawnTraffic(n.x, n.z);
  }

  function update(dt) {
    const playerPos = G.playerPos();
    for (let i = cars.length - 1; i >= 0; i--) {
      const car = cars[i];
      const dPlayer = dist2d(car.mesh.position.x, car.mesh.position.z, playerPos.x, playerPos.z);
      if (car.exploded) {
        car.deadT = (car.deadT || 0) + dt;
        if (car.deadT > 26) { // wreck cleared by the city; a fresh car appears far away
          G.scene.remove(car.mesh);
          G.vehicles.splice(G.vehicles.indexOf(car), 1);
          cars.splice(i, 1);
          const n = randomRoadNode(180, 420, playerPos.x, playerPos.z);
          if (n) spawnTraffic(n.x, n.z);
        }
        continue;
      }
      if (dPlayer > 540) {
        const n = randomRoadNode(170, 380, playerPos.x, playerPos.z);
        if (n) { car.mesh.position.set(n.x, city.height(n.x, n.z) + 0.05, n.z); car.speed = 0; giveDestination(car); }
        continue;
      }
      if (!car.path || car.pathI >= car.path.length) giveDestination(car);
      if (!car.path || !car.path.length) continue;
      const target = car.path[car.pathI];
      const dx = target.x - car.mesh.position.x, dz = target.z - car.mesh.position.z;
      const distT = Math.hypot(dx, dz);
      if (distT < 6) { car.pathI++; continue; }
      const desired = Math.atan2(dx, dz);
      const steer = clamp(angDiff(desired, car.angle) * 1.7, -1, 1);
      // brake for anything ahead
      let throttle = 0.8, brake = false;
      const fx = Math.sin(car.angle), fz = Math.cos(car.angle);
      for (const other of G.vehicles) {
        if (other === car) continue;
        const ox = other.mesh.position.x - car.mesh.position.x, oz = other.mesh.position.z - car.mesh.position.z;
        const ahead = ox * fx + oz * fz, side = Math.abs(ox * fz - oz * fx);
        if (ahead > 0 && ahead < 11 && side < 2.4) {
          if (ahead < 5.5) { brake = true; throttle = 0; }
          else throttle = Math.min(throttle, 0.25);
          break;
        }
      }
      if (G.player && G.player.mode === 'foot') {
        const ox = G.player.pos.x - car.mesh.position.x, oz = G.player.pos.z - car.mesh.position.z;
        const ahead = ox * fx + oz * fz, side = Math.abs(ox * fz - oz * fx);
        if (ahead > 0 && ahead < 8 && side < 2) { brake = true; throttle = 0; }
      }
      const cruise = car.cruise * (car.wrecked ? 0.5 : 1);
      if (car.speed > cruise) { throttle = 0; if (car.speed > cruise + 4) brake = true; }
      stepVehicle(G, car, dt, { throttle, steer, brake });
    }
  }

  return { update, cars };
}
