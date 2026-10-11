import { BATTLE_BUS_HEADING, DROWN_RESPAWN_MS, inWater, roundStartPoint, spawnPoint, zurichWorld, type Body } from "@race/shared";

// Walking into the lake or the river drowns you: a 10 s timeout with Future's "Let Me Know" meme
// music, then a respawn on the spot the player started the round on (their battle bus drop-off). The server accepts that jump because the last reported
// position was in the water (race.ts move()).
const MUSIC = `${import.meta.env.BASE_URL}audio/let-me-know.mp3`;

export class Drowning {
  private until = 0;
  private overlay: HTMLDivElement;
  private countdown: HTMLElement;
  private music = new Audio(MUSIC);

  constructor(parent: HTMLElement = document.body) {
    this.music.preload = "auto";
    this.music.volume = 0.9;
    this.overlay = document.createElement("div");
    this.overlay.className = "drowned-overlay";
    this.overlay.hidden = true;
    this.overlay.setAttribute("role", "status");
    const title = document.createElement("strong");
    title.textContent = "You drowned";
    this.countdown = document.createElement("span");
    this.overlay.append(title, this.countdown);
    parent.append(this.overlay);
  }

  /** The local player is currently timed out after drowning. */
  active(now: number) { return this.until > now; }

  /**
   * Call once per frame while the player is on foot in a running round. Starts the timeout when the
   * player enters the water and respawns them once it ends. Returns true while the player is dead.
   */
  update(body: Body, now: number, canDrown: boolean, seat: number) {
    if (this.until) {
      if (now < this.until) {
        body.vx = body.vz = 0;
        this.countdown.textContent = `Respawning in ${Math.ceil((this.until - now) / 1000)}…`;
        return true;
      }
      this.respawn(body, seat);
      return false;
    }
    if (!canDrown || body.vehicleId || !inWater(zurichWorld, body.x, body.y, body.z)) return false;
    this.until = now + DROWN_RESPAWN_MS;
    body.vx = body.vy = body.vz = 0;
    this.overlay.hidden = false;
    this.music.currentTime = 0;
    void this.music.play().catch(() => { /* Missing clip or autoplay block: keep the silent timeout. */ });
    return true;
  }

  /** Abort a running timeout (round reset, leaving the game) without respawning. */
  cancel() {
    this.until = 0;
    this.overlay.hidden = true;
    this.music.pause();
  }

  private respawn(body: Body, seat: number) {
    this.cancel();
    const start = roundStartPoint(zurichWorld, seat);
    // Players who joined mid-round have no seat and started at the spawn, like the server's spawnPlayer().
    Object.assign(body, start ?? spawnPoint(zurichWorld));
    if (start) body.rotY = BATTLE_BUS_HEADING + Math.PI;
    body.vx = body.vy = body.vz = 0;
  }

  dispose() {
    this.cancel();
    this.music.removeAttribute("src");
    this.music.load();
    this.overlay.remove();
  }
}
