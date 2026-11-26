// All player-facing text. Hebrew, right-to-left.

import type { VehicleType } from '../sim/tuning';

export const he = {
  title: 'מבצע דגל',
  docTitle: 'מבצע דגל',
  webglMissingTitle: 'לא ניתן להפעיל תלת ממד',
  webglMissingBody: 'הדפדפן או המכשיר לא תומכים ב-WebGL, שהמשחק צריך כדי לצייר את הזירה.',

  vehicles: {
    heli: { name: 'מסוק', role: 'מהיר וטס מעל הכול. שריון דק ודלק מועט.' },
    tank: { name: 'טנק', role: 'הצריח מכוון לבד. מפרק מבצרים וחומות.' },
    launcher: { name: 'משגר', role: 'טילים מתבייתים נגד קרקע ואוויר, ומוקשים.' },
    jeep: { name: "ג'יפ", role: 'היחיד שנושא את הדגל. שוחה במים.' },
  } satisfies Record<VehicleType, { name: string; role: string }>,

  hud: {
    armour: 'שריון',
    fuel: 'דלק',
    ammo: 'תחמושת',
    mine: 'מוקש',
    fire: 'אש',
    minimap: 'מפת האזור',
  },

  menu: {
    startEyebrow: 'תפוס את הדגל · שחקן יחיד',
    startBody:
      "דגל האויב מוסתר באחד משישה מבצרים באי המזרחי. פוצץ מבצרים עד שהוא נחשף, אסוף אותו בג'יפ והחזר אותו לבונקר. שים לב: גם הדגל שלך מוסתר באחד המבצרים שלך.",
    dockEyebrow: 'בבונקר',
    dockTitle: 'בחר כלי',
    dockBody: 'הכלי תוקן, תודלק וחזר למלאי.',
    lostEyebrow: 'כלי אבד',
    lostBody: 'בחר כלי אחר והמשך במבצע.',
    winEyebrow: 'ניצחון',
    winTitle: 'הדגל בידינו',
    winBody: (time: string) => `המבצע הושלם תוך ${time} דקות.`,
    loseEyebrow: 'תבוסה',
    loseTitle: 'המבצע נכשל',
    loseFlag: 'האויב הביא את הדגל שלך לבסיס שלו.',
    loseJeeps: "לא נשארו ג'יפים, ואין מי שיישא את הדגל.",
    flagExposed: "הדגל חשוף בשטח ומסומן בצהוב במפה. שלח ג'יפ.",
    towersLeft: (n: number) => `נותרו ${n} מבצרים לבדיקה.`,
    again: 'משחק חדש',
    help: 'מגע: גרירה בצד שמאל לנסיעה, כפתור אש מימין. מקלדת: חצים, רווח לירי, M למוקש. בקר: מקל שמאלי, A לירי, B למוקש.',
    soundOn: 'צליל פועל',
    soundOff: 'צליל כבוי',
    stock: (n: number) => `×${n}`,
  },

  lostTitle: (name: string, cause: 'destroyed' | 'drowned' | 'fuel') =>
    cause === 'drowned' ? `ה${name} טבע` : cause === 'fuel' ? `ה${name} התרסק` : `ה${name} הושמד`,

  msg: {
    intro: 'האי של האויב במזרח. המבצרים מסומנים באדום במפה.',
    flagRevealed: "הדגל נחשף! שלח ג'יפ לאסוף אותו.",
    towerEmpty: (n: number) => `מבצר ריק. נותרו ${n} לבדיקה.`,
    flagTaken: 'הדגל אצלך! חזור לבונקר. רחפני אויב בדרך.',
    ourFlagRevealed: 'הדגל שלך נחשף! הגן עליו.',
    ourFlagTaken: "האויב לקח את הדגל שלך! עצור את הג'יפ!",
    ourFlagDropped: 'הדגל שלך נפל בשטח.',
    flagDropped: 'הדגל נפל. אסוף אותו שוב.',
    fuelLow: 'הדלק אוזל. חזור לבונקר.',
    heliNoFuel: 'המסוק נשאר בלי דלק.',
    sinking: (name: string) => `ה${name} טובע!`,
  },

  time: (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`,
};

export type Strings = typeof he;
