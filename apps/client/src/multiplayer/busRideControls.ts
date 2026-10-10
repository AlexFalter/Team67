import { Euler, Quaternion } from 'three';

// Ride input changes the view only; the server still owns the intro timeline.
export class BusRideControls {
  yaw = 0;
  pitch = 0;
  private run = 0;
  private thanked = false;
  begin(run: number) {
    if (this.run === run) return;
    this.run = run; this.yaw = this.pitch = 0; this.thanked = false;
  }
  look(dx: number, dy: number, sensitivity: number) {
    this.yaw -= dx * sensitivity;
    this.pitch = Math.max(-1.25, Math.min(1.25, this.pitch - dy * sensitivity));
  }
  orientation(bus: Quaternion) {
    return bus.clone().multiply(new Quaternion().setFromEuler(new Euler(this.pitch, this.yaw, 0, 'YXZ')));
  }
  thank() {
    if (this.thanked) return false;
    this.thanked = true; return true;
  }
  get hasThanked() { return this.thanked; }
}
