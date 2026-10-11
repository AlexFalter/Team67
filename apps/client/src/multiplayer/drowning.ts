import { DROWN_RESPAWN_MS, inWater, respawn, zurichWorld, type Body } from "@race/shared";

// Walking into the lake or the river drowns you: a 10 s timeout with Future's "Let Me Know" meme
// music, then the same respawn as the Respawn button: the race spawn (first battle bus drop-off).
// The server does that respawn ('respawn' message in race.ts) and sends back the corrected position.
const MUSIC = `${import.meta.env.BASE_URL}audio/let-me-know.mp3`;

export class Drowning {
  private until = 0;
  private overlay: HTMLDivElement;
  private countdown: HTMLElement;
  private music = new Audio(MUSIC);

  constructor(parent: HTMLElement = document.body, private requestRespawn: () => void = () => {}) {
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
  update(body: Body, now: number, canDrown: boolean) {
    if (this.until) {
      if (now < this.until) {
        body.vx = body.vz = 0;
        this.countdown.textContent = `Respawning in ${Math.ceil((this.until - now) / 1000)}…`;
        return true;
      }
      this.respawn(body);
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

  private respawn(body: Body) {
    this.cancel();
    // Move right away so the next frame does not drown again before the server's correction arrives.
    respawn(body, zurichWorld);
    this.requestRespawn();
  }

  dispose() {
    this.cancel();
    this.music.removeAttribute("src");
    this.music.load();
    this.overlay.remove();
  }
}
