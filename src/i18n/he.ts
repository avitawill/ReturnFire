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
    pause: 'השהיה',
  },

  main: {
    eyebrow: 'תפוס את הדגל',
    body: "כל צד מסתיר את הדגל שלו באחד משישה מבצרים. פוצצו מבצרים עד שדגל האויב נחשף, אספו אותו בג'יפ והחזירו אותו לבונקר. לכל צד מלאי כלים מוגבל.",
    single: 'שחקן יחיד',
    two: 'שני שחקנים',
    map: 'מפה',
    maps: { twoShores: 'שני חופים', strait: 'המצר', atoll: 'האטול', lagoon: 'הלגונה', archipelago: 'הארכיפלג', canals: 'התעלות', rivers: 'שני הנהרות', random: 'מפה אקראית' } as Record<string, string>,
    randomSeed: (n: number) => `מפה אקראית #${n}`,
    reroll: 'מפה אחרת',
    difficulty: 'רמת קושי',
    difficulties: { easy: 'קל', medium: 'בינוני', hard: 'קשה' } as Record<string, string>,
    settings: 'הגדרות',
    install: 'התקנת המשחק',
    iosInstall: 'להתקנה באייפון: כפתור השיתוף ואז "הוספה למסך הבית".',
    twoControls: 'שחקן 1: מקלדת (או בקר ראשון). שחקן 2: בקר. בלי בקרים: שחקן 1 WASD ו-F, שחקן 2 חצים ו-Enter.',
    padsFound: (n: number) => (n === 0 ? 'לא זוהו בקרים' : n === 1 ? 'זוהה בקר אחד' : `זוהו ${n} בקרים`),
  },

  settings: {
    title: 'הגדרות',
    quality: 'איכות גרפיקה',
    qualities: { low: 'נמוכה', medium: 'בינונית', high: 'גבוהה' } as Record<string, string>,
    qualityNote: 'נמוכה מכבה צללים ותאורת פיצוצים.',
    volume: 'עוצמת קול',
    master: 'ראשי',
    music: 'מוזיקה',
    effects: 'אפקטים',
    mute: 'השתק הכול',
    back: 'חזרה',
  },

  online: {
    button: 'משחק ברשת',
    title: 'משחק ברשת',
    body: 'אחד יוצר חדר ומקבל קוד בן ארבע אותיות, השני מקליד אותו. המפה נקבעת לפי הבחירה של מי שיצר את החדר.',
    create: 'יצירת חדר',
    join: 'הצטרפות',
    codeLabel: 'קוד חדר',
    yourCode: 'הקוד שלך:',
    waiting: 'ממתינים לשחקן השני… שלחו לו את הקוד.',
    connecting: 'מתחברים לשרת… (בפעם הראשונה זה יכול לקחת עד דקה)',
    starting: 'מתחילים!',
    noServer: 'אין חיבור לשרת. בדקו את כתובת השרת או נסו שוב.',
    noRoom: 'לא נמצא חדר עם הקוד הזה.',
    roomFull: 'החדר כבר מלא.',
    server: 'כתובת שרת',
    back: 'חזרה',
    peerLeft: 'השחקן השני התנתק.',
    lagging: 'מחכים לשחקן השני…',
    you: (n: number) => `אתה שחקן ${n}`,
  },

  pause: {
    title: 'המשחק מושהה',
    resume: 'המשך',
    quit: 'יציאה לתפריט',
    hint: 'Esc, P או Start להמשך',
    onlineHint: 'במשחק ברשת המשחק ממשיך לרוץ.',
  },

  player: (n: number) => `שחקן ${n}`,

  menu: {
    startEyebrow: 'תפוס את הדגל · שחקן יחיד',
    startBody:
      "דגל האויב מוסתר באחד משישה מבצרים באי שממול. פוצץ מבצרים עד שהוא נחשף, אסוף אותו בג'יפ והחזר אותו לבונקר. שים לב: גם הדגל שלך מוסתר באחד המבצרים שלך.",
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
    toMenu: 'לתפריט',
    winOther: (n: number) => `שחקן ${n} ניצח`,
    help: 'מגע: גרירה בצד שמאל לנסיעה, כפתור אש מימין. מקלדת: חצים, רווח לירי, M למוקש. בקר: מקל שמאלי, A לירי, B למוקש.',
    soundOn: 'צליל פועל',
    soundOff: 'צליל כבוי',
    stock: (n: number) => `×${n}`,
  },

  lostTitle: (name: string, cause: 'destroyed' | 'drowned' | 'fuel') =>
    cause === 'drowned' ? `ה${name} טבע` : cause === 'fuel' ? `ה${name} התרסק` : `ה${name} הושמד`,

  msg: {
    intro: (east: boolean) => (east ? 'האי של האויב במזרח. המבצרים שלו מסומנים באדום במפה.' : 'האי של האויב במערב. המבצרים שלו מסומנים באדום במפה.'),
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
