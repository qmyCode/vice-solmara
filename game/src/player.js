// player.js — one job: Rico, the wheelman. On-foot movement and camera-
// relative steering, entering and stealing cars (parked or moving — a
// moving steal is a carjacking and the SMPD notice), health and regen,
// and the weapon he currently holds.

import { heightAt } from './city.js';
import { createPersonMesh } from './pedestrians.js';
import { clamp, angleLerp } from './rng.js';

export class Player {
  constructor(scene, x, z) {
    this.mesh = createPersonMesh(0xe8542e, 0xc98a5a, { pants: 0x27324a, hair: 0x14100c });
    this.x = x; this.z = z; this.angle = 0;
    this.speed = 0; this.velX = 0; this.velZ = 0;
    this.health = 100; this.hurtT = 99;
    this.weapon = 0;
    this.car = null; // Car being driven, or null on foot
    this.walkPhase = 0;
    this.mesh.position.set(x, heightAt(x, z), z);
    scene.add(this.mesh);
  }
  get driving() { return !!this.car; }
  posInfo() {
    const src = this.car || this;
    return {
      x: src.x, z: src.z, speed: Math.abs(this.car ? this.car.speed : this.speed),
      onFoot: !this.car, heading: this.car ? this.car.angle : this.angle,
      velX: this.velX, velZ: this.velZ,
    };
  }
  damage(n) {
    this.health = Math.max(0, this.health - n);
    this.hurtT = 0;
  }
  heal(n) { this.health = Math.min(100, this.health + n); }
  // On-foot update. moveX/moveZ are camera-relative wish direction (-1..1).
  update(dt, moveX, moveZ, sprint, colliders) {
    this.hurtT += dt;
    if (this.hurtT > 6 && this.health > 0) this.heal(3.2 * dt);
    if (this.car) {
      this.x = this.car.x; this.z = this.car.z; this.angle = this.car.angle;
      this.velX = this.car.forward().x * this.car.speed;
      this.velZ = this.car.forward().z * this.car.speed;
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const mag = Math.hypot(moveX, moveZ);
    const top = sprint ? 7.4 : 4.3;
    if (mag > 0.05) {
      const want = Math.atan2(-moveX, -moveZ);
      this.angle = angleLerp(this.angle, want, Math.min(1, dt * 12));
      this.speed += (top - this.speed) * Math.min(1, dt * 8);
    } else this.speed += (0 - this.speed) * Math.min(1, dt * 10);
    let nx = this.x + -Math.sin(this.angle) * this.speed * dt * Math.min(1, mag + 0.2);
    let nz = this.z + -Math.cos(this.angle) * this.speed * dt * Math.min(1, mag + 0.2);
    if (colliders) for (const c of colliders) {
      const dx = nx - c.x, dz = nz - c.z, d = Math.hypot(dx, dz), rr = c.r + 0.7;
      if (d < rr && d > 0.001) { nx = c.x + (dx / d) * rr; nz = c.z + (dz / d) * rr; }
    }
    if (heightAt(nx, nz) < -0.6) { nx = this.x; nz = this.z; this.speed = 0; } // no swimming
    this.velX = (nx - this.x) / Math.max(dt, 0.001); this.velZ = (nz - this.z) / Math.max(dt, 0.001);
    this.x = nx; this.z = nz;
    this.walkPhase += dt * (3 + this.speed * 1.6);
    this.mesh.position.set(this.x, heightAt(this.x, this.z) + Math.abs(Math.sin(this.walkPhase)) * 0.05 * Math.min(1, this.speed), this.z);
    this.mesh.rotation.y = this.angle;
    this.mesh.userData.legs.rotation.x = Math.sin(this.walkPhase) * 0.55 * Math.min(1, this.speed / 3);
  }
  enterCar(car) {
    this.car = car;
    car.driver = 'player';
    this.mesh.visible = false;
  }
  exitCar(scene) {
    if (!this.car) return null;
    const car = this.car;
    car.driver = null;
    this.car = null;
    const side = { x: Math.cos(car.angle), z: -Math.sin(car.angle) };
    this.x = car.x + side.x * 2.4; this.z = car.z + side.z * 2.4;
    this.angle = car.angle;
    this.mesh.visible = true;
    return car;
  }
  teleport(x, z) {
    this.x = x; this.z = z;
    if (this.car) { this.car.x = x; this.car.z = z; this.car.syncMesh(0); }
    this.mesh.position.set(x, heightAt(x, z), z);
  }
}
