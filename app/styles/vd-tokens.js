// Design tokens (VAULTD-DESIGN.md, section 1). Single source for the app's
// visual system — reference via var(--vd-…), never hardcode a hex value
// elsewhere. Injected once, globally, in root.jsx so every route (embedded
// /app/* pages as well as standalone routes like admin/support or the
// public drop page) has these variables available.
export const VD_TOKENS_CSS = `
:root {
  /* Surfaces */
  --vd-page:      #F1F1F1;
  --vd-card:      #FFFFFF;
  --vd-hairline:  #E3E3E3;
  --vd-subtle:    #F5F6F7;

  /* Encre */
  --vd-ink:       #14181F;
  --vd-ink-2:     #5C6470;
  --vd-ink-3:     #8B93A0;

  /* États de drop — la seule couleur autorisée dans l'app */
  --vd-draft:     #8C9196;
  --vd-draft-bg:  #F1F2F4;
  --vd-draft-fg:  #4A4F55;

  --vd-sched:     #B8860B;
  --vd-sched-bg:  #FFF4DC;
  --vd-sched-fg:  #7A5600;

  --vd-live:      #C8102E;
  --vd-live-bg:   #FFECEE;
  --vd-live-fg:   #96001C;

  --vd-ended:     #4A5568;
  --vd-ended-bg:  #EDF0F4;
  --vd-ended-fg:  #37414F;

  /* Élévation — remplace TOUTES les bordures */
  --vd-ring:       0 0 0 1px rgba(20,24,31,.07), 0 1px 2px rgba(20,24,31,.05);
  --vd-ring-hover: 0 0 0 1px rgba(20,24,31,.11), 0 3px 10px rgba(20,24,31,.08);

  /* Formes */
  --vd-radius:     10px;
  --vd-radius-sm:  8px;

  /* Typo */
  --vd-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --vd-mono: 'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace;
}
`;
