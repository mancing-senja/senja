import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/client/game/fight.ts';
let s = readFileSync(path, 'utf8');

const wrongEndap = `        } else {
          s.phase = 1.9 + Math.random() * 1.4;        // playing dead
          s.vel = 0;
`;
const fixedEndap = `        } else {
          s.phase = 1.6 + Math.random() * 1.4;        // playing dead
          s.vel = 0;
`;
if (!s.includes(wrongEndap)) throw new Error('mengendap correction anchor missing');
s = s.replace(wrongEndap, fixedEndap);

const oldRunner = `      if (s.phase <= 0) {
        // Alternate ends so an open-water run can never choose its current
        // side twice and pretend to be a meaningful burst.
        s.beat = s.beat === 0 ? 1 : 0;
        s.phase = 1.6 + Math.random() * 1.4;
      }
`;
const newRunner = `      if (s.phase <= 0) {
        // Alternate ends so an open-water run can never choose its current
        // side twice and pretend to be a meaningful burst.
        s.beat = s.beat === 0 ? 1 : 0;
        s.phase = 1.9 + Math.random() * 1.4;
      }
`;
if (!s.includes(oldRunner)) throw new Error('lari correction anchor missing');
s = s.replace(oldRunner, newRunner);

writeFileSync(path, s);
console.log('runner cadence correction applied');
