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

const NODE_COLORS = {
  dialogue:  { bg: '#111220', border: '#f59e0b', text: '#eeeef6' },
  choice:    { bg: '#0a1729', border: '#60a5fa', text: '#93c5fd' },
  condition: { bg: '#180f2a', border: '#a78bfa', text: '#c4b5fd' },
  label:     { bg: '#071a10', border: '#34d399', text: '#6ee7b7' },
  jump:      { bg: '#1c0d04', border: '#fb923c', text: '#fdba74' },
};
