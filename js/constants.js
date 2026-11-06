const CMD = {
  SHOW_TEXT_CFG:   101,
  SHOW_TEXT:       401,
  SHOW_CHOICES:    102,
  WHEN_CHOICE:     402,
  CHOICE_END:      404,
  IF_CONDITION:    111,
  ELSE:            411,
  IF_END:          412,
  LABEL:           118,
  JUMP_TO_LABEL:   119,
  COMMON_EVENT:    117,
  EVENT_END:         0,
};

const CONDITION_TYPES = {
  0: 'Switch', 1: 'Variable', 2: 'Self Switch', 3: 'Timer',
  4: 'Actor',  5: 'Enemy',    6: 'Character',   7: 'Gold',
  8: 'Item',   9: 'Weapon',  10: 'Armor',       11: 'Button',
  12: 'Script',
};

const VISIBLE_CODES = new Set([101, 102, 111, 118, 119]);

// Node fills sit on the shared MakerLens slate surfaces (css/tokens.css);
// borders match the --c-* node tokens in css/events-tokens.css.
const NODE_COLORS = {
  dialogue:  { bg: '#1f1a12', border: '#f59e0b', text: '#f8fafc' },
  choice:    { bg: '#0f1d33', border: '#60a5fa', text: '#bfdbfe' },
  condition: { bg: '#1a1533', border: '#a78bfa', text: '#ddd6fe' },
  label:     { bg: '#0b2019', border: '#34d399', text: '#a7f3d0' },
  jump:      { bg: '#24160c', border: '#fb923c', text: '#fed7aa' },
};

const NODE_COLORS_LIGHT = {
  dialogue:  { bg: '#fffbeb', border: '#d97706', text: '#0f172a' },
  choice:    { bg: '#eff6ff', border: '#2563eb', text: '#1e3a5f' },
  condition: { bg: '#f5f3ff', border: '#7c3aed', text: '#3b1d8c' },
  label:     { bg: '#ecfdf5', border: '#059669', text: '#064e3b' },
  jump:      { bg: '#fff7ed', border: '#ea580c', text: '#7c2d12' },
};
