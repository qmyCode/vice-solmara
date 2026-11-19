// traffic.js — one job: the city's civilian cars. A routed fleet drives the junction graph
// forever (new destination whenever one is reached, slowing for the car ahead), and a parked
// fleet lines the roadsides waiting to be stolen. Everything moves through vehicles.js physics.

import { Rng, clamp, angDiff, dist2d } from './rng.js';

export function createTraffic(G) {
  const { city, vehicles } = G;
  const rng = new Rng(city.seed * 31 + 5);
  const moving = [];
  const parkedCars = [];
  const TYPES = ['sedan', 'sedan', 'taxi', 'hatch', 'pickup', 'van'];

  function newRoute(car) {
    const target = city.nodes[rng.int(0, city.nodes.length - 1)];
    car.route = city.route(car.x, car.z, target.x, target.z);
    car.routeI = 1;
  }

  function spawnMoving() {
    const node = city.nodes[rng.int(0, city.nodes.length - 1)];
    const type = rng.pick(TYPES);
    const car = vehicles.spawn(type, node.x, node.z, rng.range(0, Math.PI * 2), { driver: 'traffic', rng });
    car.cruise = rng.range(10.5, 15);
    newRoute(car);
    moving.push(car);
    return car;
  }

  function spawnParked() {
    for (let tries = 0; tries < 40 && parkedCars.length < 52; tries++) {
      const road = city.roads[rng.int(0, city.roads.length - 1)];
      const i = rng.int(2, road.pts.length - 3);
      const p = road.pts[i], q = road.pts[i + 1];
      const dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz) || 1;
      const side = rng.chance(0.5) ? 1 : -1;
      const x = p.x + (-dz / len) * side * (road.width / 2 + 1.6);
      const z = p.z + (dx / len) * side * (road.width / 2 + 1.6);
      if (city.inWater(x, z)) continue;
      let clash = false;
      for (const c of parkedCars) if (dist2d(x, z, c.x, c.z) < 7) { clash = true; break; }
      if (clash) continue;
      const heading = Math.atan2(dz, dx) + (side < 0 ? Math.PI : 0);
      const type = rng.pick([...TYPES, 'gt']);
      const car = vehicles.spawn(type, x, z, heading, { driver: null, parked: true, rng });
      parkedCars.push(car);
    }
  }

  for (let i = 0; i < 11; i++) spawnMoving();
  spawnParked();

  /** Steer one traffic car along its route for this step. */
  function driveCar(car, dt) {
    if (car.dead || car.driver !== 'traffic') return;
    if (!car.route || car.routeI >= car.route.length) { newRoute(car); return; }
    const wp = car.route[car.routeI];
    if (dist2d(car.x, car.z, wp.x, wp.z) < 8) { car.routeI++; return; }
    const desired = Math.atan2(wp.z - car.z, wp.x - car.x);
    const steer = clamp(angDiff(car.heading, desired) * 1.7, -1, 1);
    // slow down for whatever is ahead
    let throttle = 0.8;
    const fx = Math.cos(car.heading), fz = Math.sin(car.heading);
    for (const other of vehicles.cars) {
      if (other === car) continue;
      const rx = other.x - car.x, rz = other.z - car.z;
      const ahead = rx * fx + rz * fz;
      const side = -rx * fz + rz * fx;
      if (ahead > 0 && ahead < 10 && Math.abs(side) < 2.4) { throttle = ahead < 5.5 ? -0.2 : 0.25; break; }
    }
    const targetSpeed = car.cruise * (Math.abs(steer) > 0.5 ? 0.55 : 1);
    if (car.speed > targetSpeed) throttle = Math.min(throttle, 0);
    vehicles.stepCar(car, dt, { throttle, steer }, G.onVehicleEvent);
    if (Math.abs(car.speed) < 0.4 && throttle > 0) {
      car.stuckT += dt;
      if (car.stuckT > 4) { car.stuckT = 0; newRoute(car); }
    } else car.stuckT = 0;
  }

  return {
    moving, parkedCars,
    step(dt) {
      for (const car of moving) driveCar(car, dt);
    },
    /** A parked car the player just took: it leaves the parked fleet. */
    claimParked(car) {
      const i = parkedCars.indexOf(car);
      if (i >= 0) parkedCars.splice(i, 1);
    },
    /** A car the player abandoned joins the parked fleet again. */
    releaseParked(car) {
      if (!parkedCars.includes(car)) parkedCars.push(car);
    },
  };
}
