// Replay the same hash-verified agenda in every suite. The preparer checks
// original/restored parity and recomputes the complete circulation audit.
import {loadPreparedPreview} from '../film-prepared.js';
import {FactoryFilm as Film} from '../factory-film.js';
import {DbrSimulation as Simulation,installPreparedSchedule} from '../dbr-simulation.js';
const {schedule}=await loadPreparedPreview(new URL('../',import.meta.url));
installPreparedSchedule(schedule);
export class FactoryFilm extends Film{constructor(options){super(options??{preparedSchedule:schedule});}}
export class DbrSimulation extends Simulation{constructor(options){super(options??{preparedSchedule:schedule});}}
