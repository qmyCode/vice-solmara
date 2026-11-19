// traffic.js — one job: the living traffic of Solmara.
// Routed AI cars follow GPS paths over the road graph, slow for the car
// ahead, and re-route at their destination. Parked cars line the kerbs.
// Any car can be stolen; a stolen moving car costs its driver a scare.

import * as THREE from 'three';
import { NODES, findRoute, nearestRoadPoint, heightAt } from './city.js';
import { Car, CAR_TYPES } from './vehicles.js';
import { liveRng as rng, clamp } from './rng.js';

const FLOW_TYPES = ['sedan', 'sedan', 'taxi', 'hatch', 'pickup', 'van', 'sports'];
export const allCars = []; // every Car in the world (traffic, parked, police, mission)

export class Traffic {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.cars = [];
    for (let i = 0; i < 14; i++) this.spawnFlow(true);
    for (let i = 0; i < 46; i++) this.spawnParked();
  }
  randomNodeFar(x, z, minD = 120) {
    for (let k = 0; k < 12; k++) {
      const n = NODES[(Math.random() * NODES.length) | 0];
      if (Math.hypot(n.x - x, n.z - z) > minD) return n;
    }
    return NODES[(Math.random() * NODES.length) | 0];
  }
  spawnFlow(anywhere = false) {
    const n = anywhere ? NODES[(Math.random() * NODES.length) | 0] : this.randomNodeFar(0, 0, 40);
    const type = rng.pick(FLOW_TYPES);
    const car = new Car(this.scene, type, rng.pick(CAR_TYPES[type].colors), n.x, n.z, rng.range(0, Math.PI * 2));
    car.driver = 'traffic';
    car.cruise = rng.range(9, 15);
    this.retarget(car);
    this.cars.push(car); allCars.push(car);
    return car;
  }
  spawnParked() {
    const n = NODES[(Math.random() * NODES.length) | 0];
    const type = rng.pick(FLOW_TYPES);
    const side = rng.sign();
    const car = new Car(this.scene, type, rng.pick(CAR_TYPES[type].colors),
      n.x + side * 4.6, n.z + rng.range(-3, 3), rng.range(0, Math.PI * 2));
    car.driver = null;
    // Align roughly with the road direction using the nearest route point pair.
    this.cars.push(car); allCars.push(car);
    return car;
  }
  retarget(car) {
    const dest = this.randomNodeFar(car.x, car.z, 150);
    car.route = findRoute(car.x, car.z, dest.x, dest.z);
    car.routeI = 0;
  }
  // Follow the route: pure-pursuit steering toward the next points.
  steer(car, dt) {
    if (!car.route || car.routeI >= car.route.length) { this.retarget(car); return { throttle: 0.4, steer: 0 }; }
    let target = car.route[car.routeI];
    let d = Math.hypot(target.x - car.x, target.z - car.z);
    while (d < 9 && car.routeI < car.route.length - 1) { car.routeI++; target = car.route[car.routeI]; d = Math.hypot(target.x - car.x, target.z - car.z); }
    if (car.routeI >= car.route.length - 1 && d < 10) this.retarget(car);
    const look = { x: target.x, z: target.z };
    const want = Math.atan2(-(look.x - car.x), -(look.z - car.z));
    let diff = want - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = clamp(diff * 1.6, -1, 1);
    let throttle = 0.75;
    // Slow for the car ahead.
    const f = car.forward();
    for (const o of allCars) {
      if (o === car) continue;
      const dx = o.x - car.x, dz = o.z - car.z;
      const ahead = dx * f.x + dz * f.z, side = Math.abs(dx * -f.z + dz * f.x);
      if (ahead > 0 && ahead < 9 && side < 2.2) { throttle = o.speed > car.speed ? 0.1 : -0.4; break; }
    }
    if (Math.abs(diff) > 1.1) throttle = Math.min(throttle, 0.25);
    car.speedTarget = car.cruise || 12;
    if (car.speed > car.speedTarget) throttle = Math.min(throttle, 0);
    return { throttle, steer };
  }
  update(dt) {
    for (const car of this.cars) {
      if (car.driver === 'traffic') {
        const s = this.steer(car, dt);
        car.drive(dt, s.throttle, s.steer, this.colliders, allCars);
      } else if (car.driver === null || car.driver === 'mission') {
        car.drive(dt, 0, 0, this.colliders, allCars);
      }
      if (car.burning > 0) car.burning -= dt;
    }
    // Keep density near the action: recycle far-away flow cars.
  }
  recycleNear(x, z) {
    for (const car of this.cars) {
      if (car.driver === 'traffic' && Math.hypot(car.x - x, car.z - z) > 620) {
        const n = this.randomNodeFar(x, z, 200);
        car.x = n.x; car.z = n.z; car.dead = false; car.health = 100; car.burning = 0;
        this.retarget(car);
      }
    }
  }
}
