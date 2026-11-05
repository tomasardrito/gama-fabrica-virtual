import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {restoreSchedule} from '../film-prepared.js';
const preparedSchedule=restoreSchedule(JSON.parse(gunzipSync(fs.readFileSync(new URL('../dados/preview-agenda.json.gz',import.meta.url)))));
import test from 'node:test';
import assert from 'node:assert/strict';
import {FactoryFilm} from '../factory-film.js';
import {FilmPlayback} from '../film-playback.js';
import {filmContext, bufferTrend, filmChapter} from '../film-ui.js';

const film = new FactoryFilm({preparedSchedule});
test('one click starts at 1×, pause freezes time, restart stays in film mode', () => {
  const player = new FilmPlayback(film);
  assert.equal(player.started, false);
  player.toggle();
  player.advance(25);
  assert.equal(film.snapshot().film.presentationTime, 25);
  const operation=film.snapshot().elapsed;
  player.toggle();
  player.advance(40);
  assert.equal(film.snapshot().film.presentationTime, 25);
  assert.equal(film.snapshot().elapsed, operation);
  player.restart();
  assert.equal(player.started, true);
  assert.equal(player.playing, true);
  assert.equal(film.snapshot().elapsed, 0);
});
test('the film ends once at 600 seconds, without an automatic loop', () => {
  const player = new FilmPlayback(new FactoryFilm({preparedSchedule}));
  player.toggle();
  player.advance(610);
  assert.equal(player.film.snapshot().elapsed, 600);
  assert.equal(player.playing, false);
  player.advance(10);
  assert.equal(player.film.snapshot().shipped, 44825);
  assert.equal(player.film.snapshot().elapsed, 600);
});
test('automatic cards cover opening, weekly reports, failure, comparison and results', () => {
  assert.equal(filmContext(film.seek(0)).kind, 'opening');
  for (const report of film.plan.reports) {
    const context = filmContext(film.seekPresentation(report.issuedAt + 1));
    assert.equal(context.kind, 'report');
    assert.match(context.html, new RegExp(`S${report.week}`));
  }
  assert.equal(filmContext(film.seek(339)).kind, 'breakdown');
  assert.equal(filmContext(film.seekPresentation(film.plan.story.speeches.find(s=>s.id==='F27').start+1)).kind, 'comparison');
  assert.equal(filmContext(film.seekPresentation(film.plan.story.speeches.find(s=>s.id==='F28').start+1)).kind, 'mct');
  assert.equal(filmContext(film.seekPresentation(562)).kind, 'final');
});
test('live buffer chart never reveals future points or lead times', () => {
  for (const time of [0, 135, 155, 200, 339, 450, 500]) {
    const state = film.seek(time), trend = bufferTrend(state);
    assert.ok(trend.points.every(point => point.hours <= state.dbr.workHours + 1e-6));
    if (time < 135) assert.equal(trend.leadMean, null);
    assert.ok(trend.ceiling >= Math.max(...trend.points.map(point => point.units)));
  }
});
test('all contextual cards are display-only and all chapters are named', () => {
  for (let time = 0; time <= 600; time += .5) {
    const state = film.seek(time), context = filmContext(state);
    assert.doesNotMatch(context.html, /<(button|input|select|details|a)\b/i);
    assert.ok(filmChapter(state).length > 0);
    assert.doesNotMatch(context.html, /NaN|undefined|Infinity/);
  }
});
