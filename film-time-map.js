// Presentation seconds map to one shared operational clock. No event is reordered.
export function createTimeMap(segments){
 if(!segments.length)throw new Error('A time map needs segments');
 let end=0;
 const entries=segments.map((s,i)=>{
  if(![s.from,s.to,s.duration].every(Number.isFinite)||s.to<=s.from||s.duration<=0)throw new Error('Clock intervals must be positive');
  if(i&&Math.abs(s.from-segments[i-1].to)>1e-8)throw new Error('Clock must be continuous');
  const entry={...s,start:end,end:end+s.duration,rate:(s.to-s.from)/s.duration};end=entry.end;return entry;
 });
 return {duration:end,segments:entries,inverse(seconds){
  if(typeof seconds!=='number'||Number.isNaN(seconds))throw new Error('Invalid clock time');
  const sourceTime=Math.max(entries[0].from,Math.min(entries.at(-1).to,seconds));
  const segment=entries.find(s=>sourceTime<s.to)||entries.at(-1);
  return segment.start+(sourceTime-segment.from)/segment.rate;
 },sample(seconds){
  if(typeof seconds!=='number'||Number.isNaN(seconds))throw new Error('Invalid clock time');
  const time=Math.max(0,Math.min(end,seconds));
  const segment=entries.find(s=>time<s.end)||entries.at(-1);
  const progress=Math.max(0,Math.min(1,(time-segment.start)/segment.duration));
  return {time,sourceTime:time===end?entries.at(-1).to:segment.from+(segment.to-segment.from)*progress,progress,segment};
 }};
}
