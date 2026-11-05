// One uninterrupted, real-time screening. Ending never starts another cycle.
export class FilmPlayback {
  constructor(film) { this.film=film; this.started=false; this.playing=false; this.speed=1; }
  setSpeed(value) { this.speed=[1,2,4].includes(value)?value:1; }
  toggle() {
    if ((this.film.snapshot().film?.presentationTime??this.film.snapshot().elapsed) >= 600) return;
    this.started=true;
    this.playing=!this.playing;
  }
  pause() { this.playing=false; }
  restart() { this.film.reset(); this.started=true; this.playing=true; }
  advance(seconds) {
    if (!this.playing) return;
    const state=this.film.advancePresentation?this.film.advancePresentation(seconds*this.speed):this.film.advance(seconds*this.speed);
    if ((state.film?.presentationTime??state.elapsed) >= state.duration) this.playing=false;
  }
}
